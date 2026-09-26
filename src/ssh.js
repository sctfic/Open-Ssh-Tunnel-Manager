import ssh2 from 'ssh2';
import net from 'node:net';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const { Client, utils } = ssh2;

/** Empreinte au même format SHA-256 que `ssh-keygen -lf`. */
export const fingerprint = key => `SHA256:${createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`;

/** Traduit notre JSON stable vers les options attendues par la bibliothèque ssh2. */
export function connectionOptions(config, privateKey) {
  return { host: config.ip, port: config.ssh_port, username: config.user, privateKey,
    // Ne jamais accepter automatiquement une clé hôte : cela ouvrirait la porte
    // à une interception de la connexion et de tous ses channels.
    hostVerifier: key => fingerprint(key) === config.hostFingerprint,
    readyTimeout: 15000, keepaliveInterval: config.options.ServerAliveInterval * 1000, keepaliveCountMax: config.options.ServerAliveCountMax,
    algorithms: { compress: config.options.compression === 'yes' ? ['zlib@openssh.com', 'zlib', 'none'] : ['none'] }
  };
}
function ready(client, options) {
  // Convertit les événements du client ssh2 en une Promise facile à composer.
  return new Promise((resolve, reject) => {
    client.once('ready', resolve); client.once('error', reject); client.once('close', () => reject(new Error('SSH connection closed')));
    client.connect(options);
  });
}
const forwardOut = (client, host, port, socket) => new Promise((resolve, reject) => client.forwardOut(socket?.remoteAddress || '127.0.0.1', socket?.remotePort || 0, host, port, (e, stream) => e ? reject(e) : resolve(stream)));

/**
 * Une SshSession contient une connexion SSH et tous les listeners/channels qui
 * l'utilisent. Elle ne connaît pas `tc` : le transport fourni par Manager est
 * déjà limité et mesuré au niveau réseau.
 */
export class SshSession {
  constructor(config, transport, onFailure) {
    this.config = config; this.transport = transport; this.onFailure = onFailure;
    this.client = new Client(); this.servers = []; this.sockets = new Set(); this.channels = {}; this.closed = false; this.starting = true;
    const failed = error => {
      if (this.closed) return;
      if (this.starting) this.startupError = error;
      else this.onFailure(error);
    };
    this.client.on('error', failed);
    this.client.on('close', () => failed(new Error('SSH connection lost')));
  }
  track(socket) {
    // La limite évite qu'un tunnel accessible publiquement épuise tous les
    // descripteurs de fichiers du processus.
    if (this.closed || this.sockets.size >= 4096) { socket.destroy(); return false; }
    this.sockets.add(socket); socket.on('error', () => socket.destroy()); socket.once('close', () => this.sockets.delete(socket)); return true;
  }
  // Un channel est bidirectionnel. Fermer un côté détruit toujours l'autre afin
  // de ne pas conserver une demi-connexion orpheline.
  pipe(a, b) { this.track(b); a.pipe(b).pipe(a); a.once('close', () => b.destroy()); b.once('close', () => a.destroy()); }
  async start() {
    const privateKey = await readFile(this.config.ssh_key);
    await ready(this.client, { ...connectionOptions(this.config, privateKey), sock: this.transport.socket });
    this.client.on('tcp connection', (info, accept, reject) => {
      // `tcp connection` correspond au trafic entrant d'un RemoteForward (-R).
      // On vérifie le port demandé avant d'accepter le channel distant.
      const c = this.config.tunnels['-R'][String(info.destPort)];
      if (!c || this.closed || this.sockets.size >= 4096) return reject();
      const remote = accept(); const local = net.connect(c.endpoint_port, c.endpoint_host);
      this.track(local); this.pipe(remote, local);
    });
    for (const [type, entries] of Object.entries(this.config.tunnels)) for (const [port, c] of Object.entries(entries)) {
      const key = `${type}:${port}`;
      if (type === '-R') {
        // Le serveur SSH distant crée le listener pour un channel -R.
        await new Promise((resolve, reject) => this.client.forwardIn(c.listen_host, c.listen_port, e => e ? reject(e) : resolve()));
      } else {
        // Pour -L et -D, Node écoute localement puis demande un forwardOut SSH.
        const server = net.createServer(socket => {
          if (!this.track(socket)) return;
          if (type === '-D') this.socks(socket);
          else { socket.pause(); forwardOut(this.client, c.endpoint_host, c.endpoint_port, socket).then(stream => { this.pipe(socket, stream); socket.resume(); }).catch(() => socket.destroy()); }
        });
        this.servers.push(server);
        await new Promise((resolve, reject) => { server.once('error', reject); server.listen(c.listen_port, c.listen_host, resolve); });
        server.on('error', error => { if (!this.closed) this.onFailure(error); });
      }
      this.channels[key] = { listening: true };
    }
    if (this.startupError) throw this.startupError;
    this.starting = false;
  }
  socks(socket) {
    // Implémentation minimale de SOCKS5 CONNECT, sans authentification. L'accès
    // doit donc être contrôlé avec `listen_host` et le pare-feu de la machine.
    let buffer = Buffer.alloc(0), phase = 0;
    socket.setTimeout(10000, () => socket.destroy());
    const data = chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > 1024 * 1024) return socket.destroy();
      if (phase === 0) {
        // Phase 1 : le client annonce ses méthodes ; seule « no auth » (0) est acceptée.
        if (buffer.length < 2) return;
        const n = buffer[1]; if (buffer.length < 2 + n) return;
        if (buffer[0] !== 5 || !buffer.subarray(2, 2 + n).includes(0)) { socket.end(Buffer.from([5, 255])); return; }
        socket.write(Buffer.from([5, 0])); buffer = buffer.subarray(2 + n); phase = 1;
      }
      if (buffer.length < 4) return;
      // Phase 2 : accepter uniquement la commande CONNECT (1), pas BIND/UDP.
      if (buffer[0] !== 5 || buffer[1] !== 1 || buffer[2] !== 0) { socket.end(Buffer.from([5, 7, 0, 1, 0, 0, 0, 0, 0, 0])); return; }
      let host, end;
      // ATYP 1 = IPv4, 3 = domaine, 4 = IPv6. `end` désigne le début du port.
      if (buffer[3] === 1) { end = 8; if (buffer.length < end + 2) return; host = [...buffer.subarray(4, 8)].join('.'); }
      else if (buffer[3] === 3) { if (buffer.length < 5) return; end = 5 + buffer[4]; if (buffer.length < end + 2) return; host = buffer.subarray(5, end).toString('utf8'); }
      else if (buffer[3] === 4) { end = 20; if (buffer.length < 22) return; host = Array.from({ length: 8 }, (_, i) => buffer.readUInt16BE(4 + i * 2).toString(16)).join(':'); }
      else { socket.end(Buffer.from([5, 8, 0, 1, 0, 0, 0, 0, 0, 0])); return; }
      // TCP peut regrouper la négociation et les premières données applicatives :
      // conserver ce reliquat et l'envoyer une fois le channel SSH ouvert.
      const port = buffer.readUInt16BE(end); const pending = buffer.subarray(end + 2);
      socket.pause(); socket.removeListener('data', data); socket.setTimeout(0);
      forwardOut(this.client, host, port, socket).then(stream => {
        if (socket.destroyed) return stream.destroy();
        socket.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]));
        this.pipe(socket, stream); if (pending.length) stream.write(pending); socket.resume();
      }).catch(() => socket.end(Buffer.from([5, 5, 0, 1, 0, 0, 0, 0, 0, 0])));
    };
    socket.on('data', data);
  }
  async checkChannels() {
    // Le check -L ouvre sa destination depuis le serveur SSH ; le check -R teste
    // l'endpoint local. Pour -D aucune destination n'existe avant une requête SOCKS.
    const result = {};
    for (const [type, entries] of Object.entries(this.config.tunnels)) for (const [port, c] of Object.entries(entries)) {
      const start = performance.now();
      try {
        if (type !== '-D') await new Promise((resolve, reject) => {
          let socket; let finished = false;
          const done = error => { if (finished) return; finished = true; clearTimeout(timer); socket?.destroy(); error ? reject(error) : resolve(); };
          const timer = setTimeout(() => done(new Error('Endpoint timeout')), 3000);
          if (type === '-R') { socket = net.connect(c.endpoint_port, c.endpoint_host, () => done()); socket.once('error', done); }
          else forwardOut(this.client, c.endpoint_host, c.endpoint_port).then(s => { socket = s; if (finished) s.destroy(); else done(); }).catch(done);
        });
        result[`${type}:${port}`] = { listening: true, reachable: type === '-D' ? null : true, latencyMs: Math.round(performance.now() - start) };
      } catch (e) { result[`${type}:${port}`] = { listening: true, reachable: false, error: e.message }; }
    }
    return result;
  }
  async checkRemoteListener(host, port) {
    // Tester le port -R depuis le serveur SSH respecte les écoutes loopback.
    let timedOut = false; let timer;
    try {
      return await Promise.race([
        forwardOut(this.client, host, port).then(stream => { stream.destroy(); return !timedOut; }),
        new Promise(resolve => { timer = setTimeout(() => { timedOut = true; resolve(false); }, 2500); })
      ]);
    } catch { return false; } finally { clearTimeout(timer); }
  }
  async close() {
    if (this.closed) return;
    this.closed = true;
    for (const socket of this.sockets) socket.destroy();
    for (const server of this.servers) if (server.listening) await new Promise(resolve => server.close(resolve));
    this.client.destroy(); await this.transport.close();
  }
}

export async function provision(config, password, keyDir) {
  // Le mot de passe n'est utilisé que par cette fonction et n'est jamais écrit.
  // Une nouvelle paire Ed25519 remplace ensuite l'authentification temporaire.
  await mkdir(keyDir, { recursive: true, mode: 0o700 });
  const privateFile = path.join(keyDir, 'id_ed25519');
  const keys = await new Promise((resolve, reject) => utils.generateKeyPair('ed25519', {}, (e, pair) => e ? reject(e) : resolve(pair)));
  const client = new Client(); client.on('error', () => {});
  let written = false;
  try {
    await ready(client, { ...connectionOptions(config), password });
    // Sauvegarder d'abord la clé privée : sans elle, la clé publique ajoutée à
    // distance serait inutilisable et difficile à distinguer d'un déchet.
    await writeFile(privateFile, keys.private, { flag: 'wx', mode: 0o600 }); written = true;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { client.destroy(); reject(new Error('Key installation timed out')); }, 10000);
      // La commande fixe ne contient aucune donnée utilisateur interpolée. La clé
      // publique arrive sur stdin, ce qui évite les problèmes d'échappement shell.
      client.exec('umask 077; mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh" && cat >> "$HOME/.ssh/authorized_keys" && chmod 600 "$HOME/.ssh/authorized_keys"', (error, stream) => {
        if (error) { clearTimeout(timer); return reject(error); }
        stream.on('data', () => {}); stream.stderr.on('data', () => {});
        stream.on('error', e => { clearTimeout(timer); reject(e); });
        stream.on('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('Remote key installation failed')); });
        stream.end(`\n${keys.public}\n`);
      });
    });
    return privateFile;
  } catch (e) { if (written) await rm(privateFile, { force: true }); throw e; }
  finally { client.destroy(); }
}

/** Première connexion : mémoriser la clé hôte présentée (TOFU), puis toujours
 * vérifier cette empreinte lors des connexions suivantes, y compris le test clé.
 * Le mot de passe n'est jamais copié dans la configuration retournée. */
export async function onboard(config, credentials, keyDir) {
  const client = new Client(); client.on('error', () => {});
  const privateKey = credentials.privateKey;
  if (privateKey !== undefined) {
    const parsed = utils.parseKey(privateKey);
    if (parsed instanceof Error || Array.isArray(parsed) || !parsed.isPrivateKey()) throw new Error('Clé privée SSH non chiffrée invalide');
  }
  try {
    await ready(client, { ...connectionOptions(config, privateKey),
      ...(privateKey === undefined ? { password: credentials.password } : {}),
      hostVerifier: key => { config.hostFingerprint = fingerprint(key); return true; }
    });
  } finally { client.destroy(); }
  const file = path.join(keyDir, 'id_ed25519');
  let written = false;
  try {
    if (privateKey === undefined) {
      await provision(config, credentials.password, keyDir); written = true;
    } else {
      await mkdir(keyDir, { recursive: true, mode: 0o700 });
      await writeFile(file, privateKey, { flag: 'wx', mode: 0o600 }); written = true;
    }
    // Confirmer que le serveur accepte réellement la clé avant de publier le tunnel.
    const verification = new Client(); verification.on('error', () => {});
    try { await ready(verification, connectionOptions(config, await readFile(file))); }
    finally { verification.destroy(); }
    return { ...config, ssh_key: file };
  } catch (error) { if (written) await rm(file, { force: true }); throw error; }
}
