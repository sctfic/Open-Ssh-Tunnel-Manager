import Fastify from 'fastify';
import { z } from 'zod';
import path from 'node:path';
import { mkdir, writeFile, rm, appendFile, readFile } from 'node:fs/promises';
import { Store } from './store.js';
import { Auth, level, canManage, hashPassword, verifyPassword } from './auth.js';
import { Manager } from './manager.js';
import { LinuxTransport, DirectTransport } from './network/transport.js';
import { tunnel, id, userInput, password, bandwidth, channelInput, requireThat } from './schema.js';
import { provision, onboard, OnboardingError } from './ssh.js';
import { diagnose, localPortAvailable } from './diagnostics.js';

/**
 * Construit l'application sans ouvrir de port TCP. Cette séparation permet aux
 * tests d'utiliser `app.inject()` et d'injecter un faux Manager, tandis que
 * server.js se limite au démarrage du vrai serveur.
 *
 * Dépendances principales :
 * - Store : fichiers JSON et sérialisation des mutations ;
 * - Auth : sessions Bearer et droits ;
 * - Manager : cycle de vie SSH et mesures réseau ;
 * - Transport : mode Linux privilégié ou mode direct de développement.
 */
export async function buildApp({ dataDir = process.env.OSTM_DATA_DIR || 'data', frontendDir = process.env.OSTM_FRONTEND_DIR || 'frontend', transport, manager, logger = false, restore = true } = {}) {
  // Les limites protègent le petit serveur embarqué contre les corps volumineux
  // et les connexions qui restent silencieuses trop longtemps.
  const app = Fastify({ logger, bodyLimit: 128 * 1024, requestTimeout: 30000, connectionTimeout: 15000, trustProxy: false });
  const store = new Store(dataDir); await store.init();
  const auth = new Auth(store);
  transport ||= process.env.OSTM_NETWORK_MODE === 'direct' ? new DirectTransport() : new LinuxTransport({ helper: process.env.OSTM_NETWORK_HELPER, node: process.env.OSTM_HELPER_NODE || '/usr/bin/node' });
  manager ||= new Manager(store, transport);
  const streams = new Set();
  app.decorate('services', { store, auth, manager });
  // Les erreurs de validation sont détaillées ; les erreurs internes restent
  // volontairement génériques côté client et complètes dans les logs serveur.
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError) return reply.code(400).send({ error: 'Invalid input', details: error.issues.map(i => ({ path: i.path.join('.'), message: i.message })) });
    const status = error.statusCode || 500;
    if (status >= 500) request.log.error({ err: error }, 'Operation failed');
    reply.code(status).send({ error: status >= 500 ? 'Operation failed; inspect tunnel status or server logs' : error.message });
  });
  app.addHook('onRequest', async request => {
    // Les fichiers du frontend et l'assistant de première initialisation sont
    // publics. Toutes les données métier et les commandes restent authentifiées.
    const publicRoutes = ['/', '/favicon.svg', '/health', '/api/v2/setup/status', '/api/v2/setup', '/api/v2/auth/login'];
    if (publicRoutes.includes(request.routeOptions.url) || request.routeOptions.url === '/assets/*') return;
    request.user = await auth.authenticate(request.headers.authorization);
  });
  const audit = async (request, action, target) => {
    // JSON Lines permet la rotation et l'ingestion sans relire un gros tableau.
    await appendFile(store.file('audit.jsonl'), JSON.stringify({ at: new Date().toISOString(), user: request.user.username, action, target }) + '\n', { mode: 0o600 });
  };
  // Valide l'identifiant, le niveau cumulé et l'existence du tunnel en un appel.
  const access = async (request, min) => { const key = id.parse(request.params.id); requireThat(level(request.user, key) >= min, 403, 'Insufficient tunnel permissions'); await store.get(key); return key; };
  const requireManager = async request => requireThat(canManage(request.user, await store.configs()), 403, 'Manage permission required');
  // Un manager ne voit que les ACL des tunnels qu'il gère. Les hashes ne sont
  // jamais copiés dans l'objet de sortie.
  const publicUser = (username, user, viewer) => ({ username, disabled: !!user.disabled, root: username === 'root', rights: username === 'root' ? {} : Object.fromEntries(Object.entries(user.rights).filter(([key]) => level(viewer, key) >= 4 || viewer.username === username)) });
  const viewTunnel = (key, config, user) => ({ id: key, config, level: level(user, key), ...manager.status(key) });
  const snapshot = async user => Object.entries(await store.configs()).filter(([key]) => level(user, key) >= 1).map(([key, c]) => viewTunnel(key, c, user));
  const keyPath = key => store.file(`keys/${key}/id_ed25519`);
  const checkKeyPath = (key, config) => requireThat(config.ssh_key === '' || path.resolve(config.ssh_key) === keyPath(key), 400, 'Use a key provisioned or imported for this tunnel');
  // Re-read authorization inside the mutation queue so queued revocations take effect.
  const mutate = fn => async (request, reply) => store.exclusive(async () => { request.user = await auth.authenticate(request.headers.authorization); return fn(request, reply); });

  // --- État du service et ressources réseau privilégiées --------------------
  app.get('/health', async () => ({ status: 'ok' }));
  app.get('/api/v2/setup/status', async () => ({ required: !(await store.users()).root }));
  app.post('/api/v2/setup', async (request, reply) => store.exclusive(async () => {
    const body = z.object({ password }).strict().parse(request.body);
    const users = await store.users();
    requireThat(!users.root, 409, 'Root is already initialized');
    users.root = { passwordHash: await hashPassword(body.password), rights: {}, disabled: false };
    await store.saveUsers(users);
    // Le mot de passe ne figure jamais dans l'audit ; seul l'événement initial est conservé.
    await appendFile(store.file('audit.jsonl'), JSON.stringify({ at: new Date().toISOString(), user: 'root', action: 'system.initialized', target: 'root' }) + '\n', { mode: 0o600 });
    reply.code(201);
    return { success: true };
  }));
  app.get('/api/v2/system', async () => ({ networkMode: transport.mode, units: 'Ko/s', bytesPerKo: 1000, shapingAvailable: transport.mode === 'linux', downEnforcement: 'local-reception', maxNetworkTunnels: transport.mode === 'linux' ? 254 : null }));
  app.get('/api/v2/system/orphans', async request => {
    requireThat(request.user.username === 'root', 403, 'Root required');
    return (await transport.resources()).filter(r => manager.status(r.id).desired !== 'running');
  });
  app.delete('/api/v2/system/orphans/:id', mutate(async request => {
    requireThat(request.user.username === 'root', 403, 'Root required'); const key = id.parse(request.params.id);
    requireThat(manager.status(key).desired !== 'running', 409, 'Resource belongs to a running or reconnecting tunnel');
    await transport.cleanup(key); await audit(request, 'orphan.removed', key); return { success: true };
  }));
  // --- Authentification et comptes ------------------------------------------
  app.post('/api/v2/auth/login', async request => {
    const body = z.object({ username: id, password: z.string().max(1024) }).strict().parse(request.body);
    return auth.login(body.username, body.password, request.ip);
  });
  app.post('/api/v2/auth/logout', async request => { auth.logout(request.headers.authorization); return { success: true }; });
  app.get('/api/v2/auth/me', async request => publicUser(request.user.username, request.user, request.user));
  app.put('/api/v2/auth/password', mutate(async request => {
    const body = z.object({ currentPassword: z.string().max(1024), password }).strict().parse(request.body);
    requireThat(await verifyPassword(body.currentPassword, request.user.passwordHash), 403, 'Current password is incorrect');
    const users = await store.users(); users[request.user.username].passwordHash = await hashPassword(body.password); await store.saveUsers(users);
    auth.revoke(request.user.username); await audit(request, 'password.changed', request.user.username); return { success: true, loginRequired: true };
  }));
  app.get('/api/v2/users', async request => { await requireManager(request); return Object.entries(await store.users()).map(([name, u]) => publicUser(name, u, request.user)); });
  app.post('/api/v2/users', mutate(async (request, reply) => {
    requireThat(request.user.username === 'root', 403, 'Root required'); const body = userInput.parse(request.body); const users = await store.users();
    requireThat(!Object.hasOwn(users, body.username) && body.username !== 'root', 409, 'Username unavailable');
    users[body.username] = { passwordHash: await hashPassword(body.password), rights: {}, disabled: false };
    await store.saveUsers(users); await audit(request, 'user.created', body.username); reply.code(201); return publicUser(body.username, users[body.username], request.user);
  }));
  app.patch('/api/v2/users/:username', mutate(async request => {
    requireThat(request.user.username === 'root', 403, 'Root required'); const name = id.parse(request.params.username);
    requireThat(name !== 'root', 403, 'Root cannot be disabled or modified here');
    const body = z.object({ disabled: z.boolean().optional(), password: password.optional() }).strict().parse(request.body);
    const users = await store.users(); requireThat(Object.hasOwn(users, name), 404, 'User not found');
    if (body.disabled !== undefined) users[name].disabled = body.disabled;
    // Tester `undefined` permet à root de définir volontairement un mot de passe vide.
    if (body.password !== undefined) users[name].passwordHash = await hashPassword(body.password);
    await store.saveUsers(users); auth.revoke(name); await audit(request, 'user.updated', name); return publicUser(name, users[name], request.user);
  }));
  app.delete('/api/v2/users/:username', mutate(async request => {
    requireThat(request.user.username === 'root', 403, 'Root required'); const name = id.parse(request.params.username);
    requireThat(name !== 'root', 403, 'Root cannot be deleted'); const users = await store.users(); requireThat(Object.hasOwn(users, name), 404, 'User not found');
    delete users[name]; await store.saveUsers(users); auth.revoke(name); await audit(request, 'user.deleted', name); return { success: true };
  }));
  // --- Configuration, droits et cycle de vie des tunnels --------------------
  app.post('/api/v2/tunnels/onboard', mutate(async (request, reply) => {
    await requireManager(request);
    const body = z.object({ id, ip: tunnel.shape.ip, user: tunnel.shape.user,
      ssh_port: tunnel.shape.ssh_port, password: password.optional(),
      privateKey: z.string().min(32).max(32768).optional()
    }).strict().refine(v => (v.password !== undefined) !== (v.privateKey !== undefined), 'Choisir un mot de passe ou une clé privée').parse(request.body);
    requireThat(!Object.hasOwn(await store.configs(), body.id), 409, 'Tunnel already exists');
    // Construire uniquement les propriétés publiques ; aucun secret temporaire
    // n'entre dans Store, dans l'audit ou dans la réponse HTTP.
    const initial = { ip: body.ip, user: body.user, ssh_port: body.ssh_port,
      options: { compression: 'yes', ServerAliveInterval: 10, ServerAliveCountMax: 3 } };
    let config;
    try { config = tunnel.parse(await onboard(initial, body, path.dirname(keyPath(body.id)))); }
    catch (error) {
      // Seules les erreurs prévues par le parcours SSH sont exposées. Les autres
      // conservent une réponse générique afin de ne pas divulguer le serveur.
      const message = error instanceof OnboardingError ? error.message : 'Création du tunnel SSH impossible. Consultez les journaux du serveur.';
      return reply.code(400).send({ error: message, stage: error instanceof OnboardingError ? error.stage : 'unknown' });
    }
    const users = await store.users();
    for (const user of Object.values(users)) delete user.rights[body.id];
    if (request.user.username !== 'root') users[request.user.username].rights[body.id] = 4;
    await store.saveUsers(users); await store.put(body.id, config);
    await audit(request, 'tunnel.created', body.id);
    return reply.code(201).send(viewTunnel(body.id, config, { ...users[request.user.username], username: request.user.username }));
  }));
  app.get('/api/v2/tunnels', async request => snapshot(request.user));
  app.get('/api/v2/tunnels/:id', async request => { const key = await access(request, 1); return viewTunnel(key, await store.get(key), request.user); });
  app.post('/api/v2/tunnels', mutate(async (request, reply) => {
    await requireManager(request); const body = z.object({ id, config: tunnel }).strict().parse(request.body);
    const configs = await store.configs(); requireThat(!Object.hasOwn(configs, body.id), 409, 'Tunnel already exists'); checkKeyPath(body.id, body.config);
    // Un identifiant supprimé peut être recréé. Retirer ses anciennes ACL évite
    // de rendre le nouveau tunnel visible à d'anciens utilisateurs par accident.
    const users = await store.users(); for (const u of Object.values(users)) delete u.rights[body.id];
    if (request.user.username !== 'root') users[request.user.username].rights[body.id] = 4;
    await store.saveUsers(users); await store.put(body.id, body.config); await audit(request, 'tunnel.created', body.id);
    reply.code(201); return viewTunnel(body.id, body.config, { ...users[request.user.username], username: request.user.username });
  }));
  app.put('/api/v2/tunnels/:id', mutate(async request => {
    const key = await access(request, 3); const config = tunnel.parse(request.body); checkKeyPath(key, config);
    requireThat(manager.status(key).desired === 'stopped', 409, 'Stop the tunnel before editing its connection or channels');
    await store.put(key, config); await audit(request, 'tunnel.updated', key); return viewTunnel(key, config, request.user);
  }));
  app.delete('/api/v2/tunnels/:id', mutate(async request => {
    const key = await access(request, 4); await manager.stop(key); await store.remove(key);
    const users = await store.users(); for (const u of Object.values(users)) delete u.rights[key]; await store.saveUsers(users);
    await rm(keyPath(key), { force: true }); manager.states?.delete(key); await audit(request, 'tunnel.deleted', key); return { success: true };
  }));
  app.get('/api/v2/tunnels/:id/rights', async request => {
    const key = await access(request, 4); return Object.entries(await store.users()).map(([username, user]) => ({ username, level: level({ ...user, username }, key), immutable: username === 'root' }));
  });
  app.put('/api/v2/tunnels/:id/rights/:username', mutate(async request => {
    const key = await access(request, 4); const name = id.parse(request.params.username); const body = z.object({ level: z.number().int().min(0).max(4) }).strict().parse(request.body);
    requireThat(name !== 'root', 403, 'Root permissions are immutable'); const users = await store.users(); requireThat(Object.hasOwn(users, name), 404, 'User not found');
    if (body.level) users[name].rights[key] = body.level; else delete users[name].rights[key];
    await store.saveUsers(users); await audit(request, 'rights.updated', { tunnel: key, username: name, level: body.level }); return { username: name, level: body.level };
  }));
  for (const action of ['start', 'stop', 'restart']) {
    // Les routes unitaires et groupées partagent le même contrôle de niveau 2.
    app.post(`/api/v2/tunnels/:id/${action}`, mutate(async request => { const key = await access(request, 2); await audit(request, `tunnel.${action}`, key); return manager[action](key); }));
    app.post(`/api/v2/tunnels/${action}`, mutate(async request => {
      const body = z.object({ ids: z.array(id).min(1).max(254) }).strict()
        .refine(value => new Set(value.ids).size === value.ids.length, { message: 'Duplicate tunnel identifiers', path: ['ids'] }).parse(request.body);
      const configs = await store.configs();
      // Valider toute la sélection avant la première action évite un traitement
      // partiel causé par un identifiant absent ou un droit insuffisant.
      for (const key of body.ids) {
        requireThat(Object.hasOwn(configs, key), 404, `Tunnel not found: ${key}`);
        requireThat(level(request.user, key) >= 2, 403, `Execute permission required: ${key}`);
      }
      // Un seul appel HTTP transporte toute la sélection. Les actions restent
      // ordonnées côté serveur afin de sérialiser proprement desired.json.
      const results = [];
      for (const key of body.ids) {
        try { results.push({ id: key, success: true, ...await manager[action](key) }); }
        catch (error) { results.push({ id: key, success: false, error: error.message }); }
      }
      await audit(request, `tunnels.${action}`, body.ids); return results;
    }));
  }
  app.put('/api/v2/tunnels/:id/bandwidth', mutate(async request => {
    const key = await access(request, 3); const rates = bandwidth.parse(request.body); const config = await store.get(key);
    await manager.updateLimits(key, rates);
    // Appliquer d'abord au noyau, puis persister. Si l'écriture échoue, rétablir
    // les anciennes limites pour garder configuration et réalité synchronisées.
    try { await store.put(key, { ...config, bandwidth: rates }); } catch (e) { await manager.updateLimits(key, config.bandwidth); throw e; }
    await audit(request, 'bandwidth.updated', key); return { ...rates, unit: 'Ko/s', bytesPerKo: 1000 };
  }));
  // --- Channels SSH et gestion des clés -------------------------------------
  app.post('/api/v2/tunnels/:id/channels', mutate(async (request, reply) => {
    const key = await access(request, 3); const { type, ...channel } = channelInput.parse(request.body); const config = await store.get(key);
    const restart = manager.status(key).desired === 'running';
    requireThat(!config.tunnels[type][channel.listen_port], 409, 'Channel already exists');
    if (type === '-L' || type === '-D') {
      const probe = await localPortAvailable(channel.listen_host, channel.listen_port);
      const address = `${channel.listen_host}:${channel.listen_port}`;
      requireThat(probe.available, 409, probe.error === 'EADDRINUSE'
        ? `Le port d’écoute local ${address} est déjà utilisé. Choisissez une autre IP ou un autre port.`
        : `Impossible d’ouvrir le port d’écoute local ${address} (${probe.error}). Vérifiez l’adresse locale.`);
    }
    config.tunnels[type][channel.listen_port] = channel;
    await store.put(key, tunnel.parse(config));
    if (restart) await manager.restart(key);
    await audit(request, 'channel.created', { tunnel: key, type, port: channel.listen_port, restarted: restart });
    reply.code(201); return { ...channel, restarted: restart };
  }));
  app.patch('/api/v2/tunnels/:id/channels/:type/:port', mutate(async request => {
    const key = await access(request, 3); const type = z.enum(['-L', '-R', '-D']).parse(request.params.type); const port = z.coerce.number().int().min(1).max(65535).parse(request.params.port);
    const body = z.object({ name: z.string().min(1).max(100) }).strict().parse(request.body); const config = await store.get(key);
    requireThat(config.tunnels[type][port], 404, 'Channel not found'); config.tunnels[type][port].name = body.name;
    // Le nom n'intervient pas dans la connexion : aucune coupure n'est nécessaire.
    await store.put(key, tunnel.parse(config)); await audit(request, 'channel.renamed', { tunnel: key, type, port });
    return config.tunnels[type][port];
  }));
  app.delete('/api/v2/tunnels/:id/channels/:type/:port', mutate(async request => {
    const key = await access(request, 3); const type = z.enum(['-L', '-R', '-D']).parse(request.params.type); const port = z.coerce.number().int().min(1).max(65535).parse(request.params.port);
    const config = await store.get(key); const restart = manager.status(key).desired === 'running';
    requireThat(config.tunnels[type][port], 404, 'Channel not found'); delete config.tunnels[type][port]; await store.put(key, tunnel.parse(config));
    if (restart) await manager.restart(key);
    await audit(request, 'channel.deleted', { tunnel: key, type, port, restarted: restart }); return { success: true, restarted: restart };
  }));
  app.post('/api/v2/tunnels/:id/check', mutate(async request => {
    const key = await access(request, 1); const session = manager.state(key).session;
    requireThat(session && manager.status(key).status === 'running', 409, 'Tunnel is not running'); return { channels: await session.checkChannels() };
  }));
  // Regrouper les demandes simultanées évite de multiplier les pings quand
  // plusieurs utilisateurs ouvrent la même fiche. Aucune mutation du tunnel.
  const diagnostics = new Map();
  app.post('/api/v2/tunnels/:id/diagnostics', async request => {
    const key = await access(request, 1);
    if (!diagnostics.has(key)) {
      // Enregistrer la promesse avant le premier await partage aussi la lecture
      // de configuration entre deux demandes arrivant au même instant.
      diagnostics.set(key, store.get(key).then(config => diagnose(config)).finally(() => diagnostics.delete(key)));
    }
    const channels = await diagnostics.get(key);
    request.user = await auth.authenticate(request.headers.authorization);
    await access(request, 1);
    return { channels };
  });
  app.post('/api/v2/tunnels/:id/provision', mutate(async request => {
    const key = await access(request, 3); const body = z.object({ password: z.string().min(1).max(1024) }).strict().parse(request.body);
    requireThat(manager.status(key).desired === 'stopped', 409, 'Stop the tunnel before provisioning');
    const config = await store.get(key); const file = await provision(config, body.password, path.dirname(keyPath(key)));
    await store.put(key, { ...config, ssh_key: file }); await audit(request, 'key.provisioned', key); return { success: true };
  }));
  app.put('/api/v2/tunnels/:id/key', mutate(async request => {
    const key = await access(request, 3); const body = z.object({ privateKey: z.string().min(32).max(32768) }).strict().parse(request.body);
    const { default: ssh2 } = await import('ssh2'); const parsed = ssh2.utils.parseKey(body.privateKey);
    requireThat(!(parsed instanceof Error) && !Array.isArray(parsed) && parsed.isPrivateKey(), 400, 'An unencrypted SSH private key is required');
    requireThat(manager.status(key).desired === 'stopped', 409, 'Stop the tunnel before importing a key');
    const config = await store.get(key); await mkdir(path.dirname(keyPath(key)), { recursive: true, mode: 0o700 });
    // `wx` refuse d'écraser une clé existante. Une rotation doit donc être une
    // opération explicite plutôt qu'une conséquence d'un second appel accidentel.
    await writeFile(keyPath(key), body.privateKey, { mode: 0o600, flag: 'wx' });
    await store.put(key, { ...config, ssh_key: keyPath(key) }); await audit(request, 'key.imported', key); return { success: true };
  }));
  // --- Supervision temps réel ------------------------------------------------
  app.get('/api/v2/events', async (request, reply) => {
    requireThat([...streams].filter(s => s.username === request.user.username).length < 5 && streams.size < 100, 429, 'Too many event streams');
    // Fastify ne sérialise plus cette réponse : on garde la socket ouverte et on
    // envoie des événements SSE complets que le frontend peut remplacer en bloc.
    reply.hijack(); reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
    const entry = { username: request.user.username, close: () => { clearInterval(timer); streams.delete(entry); reply.raw.end(); } }; let busy = false;
    const send = async () => {
      if (busy || reply.raw.destroyed) return; busy = true;
      try {
        // Réauthentifier chaque seconde applique immédiatement logout,
        // désactivation et changement de droits à un flux déjà ouvert.
        const user = await auth.authenticate(request.headers.authorization);
        const data = await snapshot(user);
        if (!reply.raw.write(`event: tunnels\ndata: ${JSON.stringify(data)}\n\n`)) entry.close();
      } catch { entry.close(); } finally { busy = false; }
    };
    const timer = setInterval(send, 1000); timer.unref(); streams.add(entry); reply.raw.on('close', entry.close); await send();
  });
  // Le frontend n'a ni compilation ni dépendance : Fastify sert exactement les
  // mêmes fichiers statiques que Nginx en production. La liste blanche empêche
  // toute traversée de répertoire depuis le joker d'URL.
  const webRoot = path.resolve(frontendDir);
  const webFiles = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
  ]);
  app.get('/', async (_request, reply) => { const [file, type] = webFiles.get('/'); return reply.type(type).send(await readFile(path.join(webRoot, file))); });
  app.get('/favicon.svg', async (_request, reply) => { const [file, type] = webFiles.get('/favicon.svg'); return reply.type(type).send(await readFile(path.join(webRoot, file))); });
  app.get('/assets/*', async (request, reply) => {
    const relative = request.params['*'];
    requireThat(/^[a-zA-Z0-9/_-]+\.(css|js)$/.test(relative), 404, 'Asset not found');
    const type = relative.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8';
    return reply.type(type).send(await readFile(path.join(webRoot, 'assets', relative)));
  });
  app.addHook('preClose', async () => { for (const entry of [...streams]) entry.close(); });
  // Fermer les sessions SSH avant que Fastify rende la main à PM2/systemd.
  app.addHook('onClose', async () => { await manager.close(); });
  if (restore) await manager.init();
  return app;
}
