import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { Duplex } from 'node:stream';
import { fileURLToPath } from 'node:url';
import ssh2 from 'ssh2';
import { SshSession, fingerprint, provision, onboard } from '../src/ssh.js';
import { DirectTransport } from '../src/network/transport.js';
import { buildApp } from '../src/app.js';
import { diagnose } from '../src/diagnostics.js';
const { Server, utils } = ssh2;

/**
 * Banc SSH entièrement local. Il exerce la vraie bibliothèque ssh2, les trois
 * types de channels et le relais de sous-processus sans dépendre d'Internet.
 */
const listen = server => new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(server.address().port)); });
async function unusedPort() { const server = net.createServer(); const port = await listen(server); await new Promise(r => server.close(r)); return port; }
async function fixture(t, options = {}) {
  // Le serveur SSH miniature accepte l'authentification et reproduit juste les
  // requêtes nécessaires à OSTM : direct-tcpip, tcpip-forward et exec.
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ostm-ssh-')); const keys = utils.generateKeyPairSync('ed25519', {}); await writeFile(path.join(dir, 'key'), keys.private);
  const sockets = new Set(), clients = new Set(), reverses = new Set(); let installed = '', installCommand = '';
  const track = s => { sockets.add(s); s.on('error', () => s.destroy()); s.on('close', () => sockets.delete(s)); return s; };
  const echo = net.createServer(s => { track(s); s.pipe(s); }); const echoPort = await listen(echo);
  const server = new Server({ hostKeys: [keys.private] }, client => {
    clients.add(client); client.on('error', () => {}); client.on('close', () => clients.delete(client));
    client.on('authentication', ctx => {
      // Un vrai serveur refuse une clé inconnue : accepter toute authentification
      // masquerait une installation de clé publique manquante ou incorrecte.
      if (ctx.method === 'password') return options.rejectPassword ? ctx.reject() : ctx.accept();
      if (ctx.method !== 'publickey') return ctx.reject();
      const allowed = [utils.parseKey(keys.private), ...(installed.trim() ? [utils.parseKey(installed.trim())] : [])];
      const key = allowed.find(k => !(k instanceof Error) && k.getPublicSSH().equals(ctx.key.data));
      if (key && (!ctx.signature || key.verify(ctx.blob, ctx.signature, ctx.hashAlgo) === true)) ctx.accept();
      else ctx.reject();
    });
    client.on('ready', () => {
      client.on('tcpip', (accept, reject, info) => {
        const target = track(net.connect(info.destPort, info.destIP));
        target.once('connect', () => { const ch = track(accept()); ch.pipe(target).pipe(ch); ch.once('close', () => target.destroy()); target.once('close', () => ch.destroy()); });
        target.once('error', reject);
      });
      client.on('request', (accept, reject, name, info) => {
        if (name === 'tcpip-forward') {
          const reverse = net.createServer(socket => {
            track(socket);
            client.forwardOut(info.bindAddr, info.bindPort, socket.remoteAddress, socket.remotePort, (err, stream) => {
              if (err) return socket.destroy(); track(stream); stream.pipe(socket).pipe(stream); socket.once('close', () => stream.destroy()); stream.once('close', () => socket.destroy());
            });
          });
          reverses.add(reverse); reverse.on('error', reject); reverse.listen(info.bindPort, info.bindAddr, () => accept(info.bindPort));
        } else reject?.();
      });
      client.on('session', accept => {
        const session = accept(); session.on('exec', (acceptExec, rejectExec, info) => { installCommand = info.command; const stream = acceptExec(); stream.on('data', data => { installed += data; }); stream.on('end', () => { stream.exit(options.rejectInstall ? 1 : 0); stream.end(); }); });
      });
    });
  });
  const sshPort = await listen(server);
  t.after(async () => {
    for (const s of sockets) s.destroy(); for (const c of clients) c.end();
    for (const s of [echo, server, ...reverses]) if (s === server || s.listening) await new Promise(r => s.close(r));
    await rm(dir, { recursive: true, force: true });
  });
  const config = { ip: '127.0.0.1', ssh_port: sshPort, user: 'tester', ssh_key: path.join(dir, 'key'), hostFingerprint: fingerprint(utils.parseKey(keys.private).getPublicSSH()), options: { compression: 'yes', ServerAliveInterval: 10, ServerAliveCountMax: 3 }, bandwidth: { up: 0, down: 0 }, tunnels: { '-L': {}, '-R': {}, '-D': {} } };
  return { config, echoPort, dir, installed: () => installed, installCommand: () => installCommand };
}
async function exchange(port, payload) {
  const socket = net.connect(port, '127.0.0.1'); socket.setTimeout(3000, () => socket.destroy(new Error('timeout')));
  await once(socket, 'connect'); const received = once(socket, 'data'); socket.write(payload); const [data] = await received; socket.destroy(); return data;
}
test('onboarding pins the host and stores only a verified private key', async t => {
  const { config, dir, installed } = await fixture(t);
  const result = await onboard({ ...config, hostFingerprint: undefined }, { password: 'temporary-secret' }, path.join(dir, 'generated'));
  assert.equal(result.hostFingerprint, config.hostFingerprint);
  assert.match(installed(), /ssh-ed25519/);
  assert.doesNotMatch(JSON.stringify(result), /temporary-secret/);
  assert.ok(utils.parseKey(await readFile(result.ssh_key)).isPrivateKey());
  const imported = await onboard({ ...config }, { privateKey: await readFile(config.ssh_key, 'utf8') }, path.join(dir, 'imported'));
  assert.equal(imported.hostFingerprint, config.hostFingerprint);
  await assert.rejects(onboard(config, { privateKey: 'invalid' }, path.join(dir, 'bad')), /invalide/);
});
test('onboarding API authenticates managers and persists no password', async t => {
  const { config, dir } = await fixture(t);
  const app = await buildApp({ dataDir: path.join(dir, 'api'), transport: new DirectTransport(), restore: false });
  t.after(() => app.close());
  await app.inject({ method: 'POST', url: '/api/v2/setup', payload: { password: '' } });
  const login = await app.inject({ method: 'POST', url: '/api/v2/auth/login', payload: { username: 'root', password: '' } });
  const payload = { id: 'new-tunnel', ip: config.ip, ssh_port: config.ssh_port, user: config.user, password: 'transient-secret' };
  assert.equal((await app.inject({ method: 'POST', url: '/api/v2/tunnels/onboard', payload })).statusCode, 401);
  const headers = { authorization: `Bearer ${login.json().token}` };
  const response = await app.inject({ method: 'POST', url: '/api/v2/tunnels/onboard', payload, headers });
  assert.equal(response.statusCode, 201, response.body);
  const saved = await app.services.store.get(payload.id);
  assert.equal(saved.hostFingerprint, config.hostFingerprint);
  assert.doesNotMatch(JSON.stringify(saved) + response.body + await readFile(app.services.store.file('audit.jsonl'), 'utf8'), /transient-secret/);
  assert.equal((await app.inject({ method: 'POST', url: '/api/v2/tunnels/onboard', payload, headers })).statusCode, 409);
});

test('onboarding reports whether password login or public-key installation failed', async t => {
  const passwordFixture = await fixture(t, { rejectPassword: true });
  await assert.rejects(onboard({ ...passwordFixture.config, hostFingerprint: undefined }, { password: 'wrong' }, path.join(passwordFixture.dir, 'password-error')),
    error => error.stage === 'password' && /mot de passe impossible/.test(error.message));

  const installFixture = await fixture(t, { rejectInstall: true });
  await assert.rejects(onboard({ ...installFixture.config, hostFingerprint: undefined }, { password: 'accepted' }, path.join(installFixture.dir, 'install-error')),
    error => error.stage === 'install' && /installation de la clé publique/.test(error.message));
});
test('real SSH carries local and reverse forwarding and measures encrypted transport', { timeout: 15000 }, async t => {
  const { config, echoPort } = await fixture(t); const localPort = await unusedPort(), reversePort = await unusedPort();
  const closedListenerPort = await unusedPort(), closedEndpointPort = await unusedPort();
  config.tunnels['-L'][localPort] = { name: 'local', listen_port: localPort, listen_host: '127.0.0.1', endpoint_host: '127.0.0.1', endpoint_port: echoPort };
  // Le listener local de ce channel démarre correctement, mais son équipement
  // final n'écoute pas : le diagnostic doit donc échouer malgré le port local.
  config.tunnels['-L'][closedListenerPort] = { name: 'closed-endpoint', listen_port: closedListenerPort, listen_host: '127.0.0.1', endpoint_host: '127.0.0.1', endpoint_port: closedEndpointPort };
  config.tunnels['-R'][reversePort] = { name: 'reverse', listen_port: reversePort, listen_host: '127.0.0.1', endpoint_host: '127.0.0.1', endpoint_port: echoPort };
  const transport = await new DirectTransport().open('test', config); const session = new SshSession(config, transport, () => {});
  try {
    await session.start(); assert.equal((await exchange(localPort, 'local hello')).toString(), 'local hello');
    assert.equal((await exchange(reversePort, 'reverse hello')).toString(), 'reverse hello');
    const checks = await session.checkChannels(); assert.equal(checks[`-L:${localPort}`].reachable, true); assert.equal(checks[`-R:${reversePort}`].reachable, true);
    const probes = await diagnose(config, session);
    assert.equal(typeof probes[`-L:${localPort}`].tcp, 'number');
    assert.equal(probes[`-L:${closedListenerPort}`].tcp, null);
    assert.equal(typeof probes[`-R:${reversePort}`].tcp, 'number');
    assert.ok(probes[`-L:${localPort}`].icmp === null || typeof probes[`-L:${localPort}`].icmp === 'number');
    const stats = await transport.stats(); assert.ok(stats.upBytes > 24); assert.ok(stats.downBytes > 24); assert.equal(stats.networkOverheadIncluded, false);
  } finally { await session.close(); }
  await assert.rejects(exchange(localPort, 'closed'), /ECONNREFUSED/);
});
test('SOCKS5 accepts fragmented negotiation and transports a domain target', { timeout: 15000 }, async t => {
  // Fractionner volontairement la négociation vérifie que le parseur ne suppose
  // jamais qu'un paquet TCP contient un message SOCKS complet.
  const { config, echoPort } = await fixture(t); const port = await unusedPort();
  config.tunnels['-D'][port] = { name: 'socks', listen_port: port, listen_host: '127.0.0.1' };
  const transport = await new DirectTransport().open('test', config); const session = new SshSession(config, transport, () => {});
  try {
    await session.start(); const socket = net.connect(port, '127.0.0.1'); await once(socket, 'connect');
    socket.setTimeout(3000, () => socket.destroy(new Error('timeout')));
    let response = once(socket, 'data'); socket.write(Buffer.from([5])); socket.write(Buffer.from([1, 0])); assert.deepEqual((await response)[0], Buffer.from([5, 0]));
    const domain = Buffer.from('127.0.0.1'); const request = Buffer.alloc(7 + domain.length); request.set([5, 1, 0, 3, domain.length]); domain.copy(request, 5); request.writeUInt16BE(echoPort, 5 + domain.length);
    response = once(socket, 'data'); socket.write(request); assert.equal((await response)[0][1], 0);
    response = once(socket, 'data'); socket.write('socks hello'); assert.equal((await response)[0].toString(), 'socks hello'); socket.destroy();
  } finally { await session.close(); }
});
test('untrusted SSH host key fails closed and direct mode refuses fake bandwidth limiting', { timeout: 15000 }, async t => {
  const { config } = await fixture(t); config.hostFingerprint = `SHA256:${'B'.repeat(43)}`;
  const transport = await new DirectTransport().open('test', config); const session = new SshSession(config, transport, () => {});
  try { await assert.rejects(session.start(), /verification failed/i); } finally { await session.close(); }
  config.bandwidth.up = 100; await assert.rejects(new DirectTransport().open('test', config), /Linux/);
});
test('provision installs only a public key and saves the generated private key locally', { timeout: 15000 }, async t => {
  const { config, dir, installed } = await fixture(t);
  const file = await provision(config, 'temporary-password', path.join(dir, 'provisioned'));
  assert.ok(utils.parseKey(await readFile(file)).isPrivateKey()); assert.match(installed(), /ssh-ed25519/); assert.equal(installed().includes('PRIVATE'), false);
});

test('key installation selects OpenWrt root or the standard user directory', { skip: process.platform === 'win32' }, async t => {
  // Exécuter le vrai shell d'installation dans des répertoires temporaires :
  // aucun fichier de configuration SSH de la machine de test n'est touché.
  const { config, dir, installed, installCommand } = await fixture(t);
  await provision(config, 'temporary-password', path.join(dir, 'generated'));
  for (const [name, uid, openwrt, dropbear, expected] of [
    ['openwrt-root', 0, true, true, 'dropbear'],
    ['openwrt-user', 1000, true, true, 'home/.ssh'],
    ['openssh-root', 0, false, true, 'home/.ssh'],
    ['standard-user', 1000, false, false, 'home/.ssh']
  ]) {
    const base = path.join(dir, name);
    await mkdir(path.join(base, 'home'), { recursive: true });
    if (dropbear) await mkdir(path.join(base, 'dropbear'));
    if (openwrt) await writeFile(path.join(base, 'openwrt_release'), 'test');
    const target = path.join(base, expected, 'authorized_keys');
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, 'existing-key\n');
    const command = installCommand().replace('$(id -u)', String(uid))
      .replaceAll('/etc/openwrt_release', `${base}/openwrt_release`).replaceAll('/etc/dropbear', `${base}/dropbear`);
    const child = spawn('/bin/sh', ['-c', command], { env: { ...process.env, HOME: path.join(base, 'home') } });
    child.stdout.resume(); child.stderr.resume(); const closed = once(child, 'close');
    child.stdin.end(installed());
    assert.equal((await closed)[0], 0, name);
    assert.equal(await readFile(target, 'utf8'), 'existing-key\n' + installed(), name);
  }
});
test('SSH handshake and channels work across the subprocess transport bridge', { timeout: 15000 }, async t => {
  const { config, echoPort } = await fixture(t); const port = await unusedPort();
  config.tunnels['-L'][port] = { name: 'relayed', listen_host: '127.0.0.1', listen_port: port, endpoint_host: '127.0.0.1', endpoint_port: echoPort };
  const child = spawn(process.execPath, [fileURLToPath(new URL('../src/network/relay.js', import.meta.url)), config.ip, String(config.ssh_port)], { stdio: ['pipe', 'pipe', 'pipe'] });
  child.stderr.resume(); const socket = Duplex.from({ readable: child.stdout, writable: child.stdin }); socket.on('error', () => {});
  const transport = { socket, close: async () => { socket.destroy(); child.kill(); } };
  const session = new SshSession(config, transport, () => {});
  try { await session.start(); assert.equal((await exchange(port, 'relayed')).toString(), 'relayed'); }
  finally { await session.close(); }
});
