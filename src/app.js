import Fastify from 'fastify';
import { z } from 'zod';
import path from 'node:path';
import { mkdir, writeFile, rm, appendFile } from 'node:fs/promises';
import { Store } from './store.js';
import { Auth, level, canManage, hashPassword, verifyPassword } from './auth.js';
import { Manager } from './manager.js';
import { LinuxTransport, DirectTransport } from './network/transport.js';
import { tunnel, id, userInput, password, bandwidth, channelInput, requireThat } from './schema.js';
import { provision } from './ssh.js';

export async function buildApp({ dataDir = process.env.OSTM_DATA_DIR || 'data', transport, manager, logger = false, restore = true } = {}) {
  const app = Fastify({ logger, bodyLimit: 128 * 1024, requestTimeout: 30000, connectionTimeout: 15000, trustProxy: false });
  const store = new Store(dataDir); await store.init();
  const auth = new Auth(store);
  transport ||= process.env.OSTM_NETWORK_MODE === 'direct' ? new DirectTransport() : new LinuxTransport({ helper: process.env.OSTM_NETWORK_HELPER, node: process.env.OSTM_HELPER_NODE || '/usr/bin/node' });
  manager ||= new Manager(store, transport);
  const streams = new Set();
  app.decorate('services', { store, auth, manager });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError) return reply.code(400).send({ error: 'Invalid input', details: error.issues.map(i => ({ path: i.path.join('.'), message: i.message })) });
    const status = error.statusCode || 500;
    if (status >= 500) request.log.error({ err: error }, 'Operation failed');
    reply.code(status).send({ error: status >= 500 ? 'Operation failed; inspect tunnel status or server logs' : error.message });
  });
  app.addHook('onRequest', async request => {
    if (request.routeOptions.url === '/health' || request.routeOptions.url === '/api/v2/auth/login') return;
    request.user = await auth.authenticate(request.headers.authorization);
  });
  const audit = async (request, action, target) => {
    await appendFile(store.file('audit.jsonl'), JSON.stringify({ at: new Date().toISOString(), user: request.user.username, action, target }) + '\n', { mode: 0o600 });
  };
  const access = async (request, min) => { const key = id.parse(request.params.id); requireThat(level(request.user, key) >= min, 403, 'Insufficient tunnel permissions'); await store.get(key); return key; };
  const requireManager = async request => requireThat(canManage(request.user, await store.configs()), 403, 'Manage permission required');
  const publicUser = (username, user, viewer) => ({ username, disabled: !!user.disabled, root: username === 'root', rights: username === 'root' ? {} : Object.fromEntries(Object.entries(user.rights).filter(([key]) => level(viewer, key) >= 4 || viewer.username === username)) });
  const viewTunnel = (key, config, user) => ({ id: key, config, level: level(user, key), ...manager.status(key) });
  const snapshot = async user => Object.entries(await store.configs()).filter(([key]) => level(user, key) >= 1).map(([key, c]) => viewTunnel(key, c, user));
  const keyPath = key => store.file(`keys/${key}/id_ed25519`);
  const checkKeyPath = (key, config) => requireThat(config.ssh_key === '' || path.resolve(config.ssh_key) === keyPath(key), 400, 'Use a key provisioned or imported for this tunnel');
  // Re-read authorization inside the mutation queue so queued revocations take effect.
  const mutate = fn => async (request, reply) => store.exclusive(async () => { request.user = await auth.authenticate(request.headers.authorization); return fn(request, reply); });

  app.get('/health', async () => ({ status: 'ok' }));
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
  app.post('/api/v2/auth/login', async request => {
    const body = z.object({ username: id, password: z.string().min(1).max(1024) }).strict().parse(request.body);
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
    await requireManager(request); const body = userInput.parse(request.body); const users = await store.users();
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
    if (body.password) users[name].passwordHash = await hashPassword(body.password);
    await store.saveUsers(users); auth.revoke(name); await audit(request, 'user.updated', name); return publicUser(name, users[name], request.user);
  }));
  app.delete('/api/v2/users/:username', mutate(async request => {
    requireThat(request.user.username === 'root', 403, 'Root required'); const name = id.parse(request.params.username);
    requireThat(name !== 'root', 403, 'Root cannot be deleted'); const users = await store.users(); requireThat(Object.hasOwn(users, name), 404, 'User not found');
    delete users[name]; await store.saveUsers(users); auth.revoke(name); await audit(request, 'user.deleted', name); return { success: true };
  }));
  app.get('/api/v2/tunnels', async request => snapshot(request.user));
  app.get('/api/v2/tunnels/:id', async request => { const key = await access(request, 1); return viewTunnel(key, await store.get(key), request.user); });
  app.post('/api/v2/tunnels', mutate(async (request, reply) => {
    await requireManager(request); const body = z.object({ id, config: tunnel }).strict().parse(request.body);
    const configs = await store.configs(); requireThat(!Object.hasOwn(configs, body.id), 409, 'Tunnel already exists'); checkKeyPath(body.id, body.config);
    // Clear stale ACL entries before publishing a reused tunnel identifier.
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
    app.post(`/api/v2/tunnels/:id/${action}`, mutate(async request => { const key = await access(request, 2); await audit(request, `tunnel.${action}`, key); return manager[action](key); }));
    app.post(`/api/v2/actions/${action}`, mutate(async request => {
      const results = [];
      for (const key of Object.keys(await store.configs())) if (level(request.user, key) >= 2) {
        try { results.push({ id: key, success: true, ...await manager[action](key) }); } catch (e) { results.push({ id: key, success: false, error: e.message }); }
      }
      await audit(request, `tunnels.${action}`, results.map(x => x.id)); return results;
    }));
  }
  app.put('/api/v2/tunnels/:id/bandwidth', mutate(async request => {
    const key = await access(request, 3); const rates = bandwidth.parse(request.body); const config = await store.get(key);
    await manager.updateLimits(key, rates);
    try { await store.put(key, { ...config, bandwidth: rates }); } catch (e) { await manager.updateLimits(key, config.bandwidth); throw e; }
    await audit(request, 'bandwidth.updated', key); return { ...rates, unit: 'Ko/s', bytesPerKo: 1000 };
  }));
  app.post('/api/v2/tunnels/:id/channels', mutate(async (request, reply) => {
    const key = await access(request, 3); const { type, ...channel } = channelInput.parse(request.body); const config = await store.get(key);
    requireThat(manager.status(key).desired === 'stopped', 409, 'Stop the tunnel before editing channels');
    requireThat(!config.tunnels[type][channel.listen_port], 409, 'Channel already exists'); config.tunnels[type][channel.listen_port] = channel;
    await store.put(key, tunnel.parse(config)); await audit(request, 'channel.created', key); reply.code(201); return channel;
  }));
  app.delete('/api/v2/tunnels/:id/channels/:type/:port', mutate(async request => {
    const key = await access(request, 3); const type = z.enum(['-L', '-R', '-D']).parse(request.params.type); const port = z.coerce.number().int().min(1).max(65535).parse(request.params.port);
    requireThat(manager.status(key).desired === 'stopped', 409, 'Stop the tunnel before editing channels'); const config = await store.get(key);
    requireThat(config.tunnels[type][port], 404, 'Channel not found'); delete config.tunnels[type][port]; await store.put(key, config); await audit(request, 'channel.deleted', key); return { success: true };
  }));
  app.post('/api/v2/tunnels/:id/check', mutate(async request => {
    const key = await access(request, 1); const session = manager.state(key).session;
    requireThat(session && manager.status(key).status === 'running', 409, 'Tunnel is not running'); return { channels: await session.checkChannels() };
  }));
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
    await writeFile(keyPath(key), body.privateKey, { mode: 0o600, flag: 'wx' });
    await store.put(key, { ...config, ssh_key: keyPath(key) }); await audit(request, 'key.imported', key); return { success: true };
  }));
  app.get('/api/v2/events', async (request, reply) => {
    requireThat([...streams].filter(s => s.username === request.user.username).length < 5 && streams.size < 100, 429, 'Too many event streams');
    reply.hijack(); reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
    const entry = { username: request.user.username, close: () => { clearInterval(timer); streams.delete(entry); reply.raw.end(); } }; let busy = false;
    const send = async () => {
      if (busy || reply.raw.destroyed) return; busy = true;
      try {
        const user = await auth.authenticate(request.headers.authorization);
        const data = await snapshot(user);
        if (!reply.raw.write(`event: tunnels\ndata: ${JSON.stringify(data)}\n\n`)) entry.close();
      } catch { entry.close(); } finally { busy = false; }
    };
    const timer = setInterval(send, 1000); timer.unref(); streams.add(entry); reply.raw.on('close', entry.close); await send();
  });
  app.addHook('preClose', async () => { for (const entry of [...streams]) entry.close(); });
  app.addHook('onClose', async () => { await manager.close(); });
  if (restore) await manager.init();
  return app;
}
