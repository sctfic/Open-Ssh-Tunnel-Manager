import ssh2 from 'ssh2';
import net from 'node:net';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const { Client, utils } = ssh2;
export const fingerprint = key => `SHA256:${createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`;
export function connectionOptions(config, privateKey) {
  return { host: config.ip, port: config.ssh_port, username: config.user, privateKey,
    hostVerifier: key => fingerprint(key) === config.hostFingerprint,
    readyTimeout: 15000, keepaliveInterval: config.options.ServerAliveInterval * 1000, keepaliveCountMax: config.options.ServerAliveCountMax,
    algorithms: { compress: config.options.compression === 'yes' ? ['zlib@openssh.com', 'zlib', 'none'] : ['none'] }
  };
}
function ready(client, options) {
  return new Promise((resolve, reject) => {
    client.once('ready', resolve); client.once('error', reject); client.once('close', () => reject(new Error('SSH connection closed')));
    client.connect(options);
  });
}
const forwardOut = (client, host, port, socket) => new Promise((resolve, reject) => client.forwardOut(socket?.remoteAddress || '127.0.0.1', socket?.remotePort || 0, host, port, (e, stream) => e ? reject(e) : resolve(stream)));

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
    if (this.closed || this.sockets.size >= 4096) { socket.destroy(); return false; }
    this.sockets.add(socket); socket.on('error', () => socket.destroy()); socket.once('close', () => this.sockets.delete(socket)); return true;
  }
  pipe(a, b) { this.track(b); a.pipe(b).pipe(a); a.once('close', () => b.destroy()); b.once('close', () => a.destroy()); }
  async start() {
    const privateKey = await readFile(this.config.ssh_key);
    await ready(this.client, { ...connectionOptions(this.config, privateKey), sock: this.transport.socket });
    this.client.on('tcp connection', (info, accept, reject) => {
      const c = this.config.tunnels['-R'][String(info.destPort)];
      if (!c || this.closed || this.sockets.size >= 4096) return reject();
      const remote = accept(); const local = net.connect(c.endpoint_port, c.endpoint_host);
      this.track(local); this.pipe(remote, local);
    });
    for (const [type, entries] of Object.entries(this.config.tunnels)) for (const [port, c] of Object.entries(entries)) {
      const key = `${type}:${port}`;
      if (type === '-R') {
        await new Promise((resolve, reject) => this.client.forwardIn(c.listen_host, c.listen_port, e => e ? reject(e) : resolve()));
      } else {
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
    let buffer = Buffer.alloc(0), phase = 0;
    socket.setTimeout(10000, () => socket.destroy());
    const data = chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.length > 1024 * 1024) return socket.destroy();
      if (phase === 0) {
        if (buffer.length < 2) return;
        const n = buffer[1]; if (buffer.length < 2 + n) return;
        if (buffer[0] !== 5 || !buffer.subarray(2, 2 + n).includes(0)) { socket.end(Buffer.from([5, 255])); return; }
        socket.write(Buffer.from([5, 0])); buffer = buffer.subarray(2 + n); phase = 1;
      }
      if (buffer.length < 4) return;
      if (buffer[0] !== 5 || buffer[1] !== 1 || buffer[2] !== 0) { socket.end(Buffer.from([5, 7, 0, 1, 0, 0, 0, 0, 0, 0])); return; }
      let host, end;
      if (buffer[3] === 1) { end = 8; if (buffer.length < end + 2) return; host = [...buffer.subarray(4, 8)].join('.'); }
      else if (buffer[3] === 3) { if (buffer.length < 5) return; end = 5 + buffer[4]; if (buffer.length < end + 2) return; host = buffer.subarray(5, end).toString('utf8'); }
      else if (buffer[3] === 4) { end = 20; if (buffer.length < 22) return; host = Array.from({ length: 8 }, (_, i) => buffer.readUInt16BE(4 + i * 2).toString(16)).join(':'); }
      else { socket.end(Buffer.from([5, 8, 0, 1, 0, 0, 0, 0, 0, 0])); return; }
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
  async close() {
    if (this.closed) return;
    this.closed = true;
    for (const socket of this.sockets) socket.destroy();
    for (const server of this.servers) if (server.listening) await new Promise(resolve => server.close(resolve));
    this.client.destroy(); await this.transport.close();
  }
}

export async function provision(config, password, keyDir) {
  await mkdir(keyDir, { recursive: true, mode: 0o700 });
  const privateFile = path.join(keyDir, 'id_ed25519');
  const keys = await new Promise((resolve, reject) => utils.generateKeyPair('ed25519', {}, (e, pair) => e ? reject(e) : resolve(pair)));
  const client = new Client(); client.on('error', () => {});
  let written = false;
  try {
    await ready(client, { ...connectionOptions(config), password });
    // Save the private key before changing the remote authorized_keys file.
    await writeFile(privateFile, keys.private, { flag: 'wx', mode: 0o600 }); written = true;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { client.destroy(); reject(new Error('Key installation timed out')); }, 10000);
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
