// Authorized smoke test with a temporary OpenSSH instance and an ephemeral key.
import https from 'node:https';
import net from 'node:net';
import { readFile, writeFile, mkdtemp, chmod, rm, rmdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import ssh2 from 'ssh2';
import { fingerprint } from '../src/ssh.js';

if (process.getuid?.() !== 0) throw new Error('Run as root on rpi3 for this explicit smoke test');
const ca = await readFile('/etc/ssl/certs/ostm-rpi3-test.crt');
const password = (await readFile('/home/alban/.config/ostm-test/root-password', 'utf8')).trim();
let token;
async function api(method, path, body) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: '127.0.0.1', servername: 'rpi3.lan', port: 8443, ca, method, path: `/api/v2${path}`,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}) }
    }, res => {
      let text = ''; res.on('data', chunk => text += chunk); res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`${method} ${path}: HTTP ${res.statusCode} ${text}`));
        resolve(JSON.parse(text));
      });
    });
    req.on('error', reject); req.setTimeout(60000, () => req.destroy(new Error('API timeout'))); req.end(payload);
  });
}
const id = `smoke-${Date.now()}`;
const keys = ssh2.utils.generateKeyPairSync('ed25519', {});
const temporary = await mkdtemp('/run/ostm-smoke-');
await chmod(temporary, 0o755);
await writeFile(`${temporary}/authorized_keys`, `${keys.public}\n`, { mode: 0o644 });
let sshd, sshdErrors = '';
const peers = new Set();
const echo = net.createServer(s => { peers.add(s); s.on('close', () => peers.delete(s)); s.on('error', () => {}); s.pipe(s); });
let created = false;
try {
  await new Promise(r => echo.listen(0, '127.0.0.1', r));
  const reserve = net.createServer(); await new Promise(r => reserve.listen(0, '127.0.0.1', r));
  const listenPort = reserve.address().port; await new Promise(r => reserve.close(r));
  const sshReserve = net.createServer(); await new Promise(r => sshReserve.listen(0, '10.0.0.253', r));
  const sshPort = sshReserve.address().port; await new Promise(r => sshReserve.close(r));
  await writeFile(`${temporary}/sshd_config`, [
    `Port ${sshPort}`, 'ListenAddress 10.0.0.253', 'HostKey /etc/ssh/ssh_host_ed25519_key',
    `PidFile ${temporary}/sshd.pid`, `AuthorizedKeysFile ${temporary}/authorized_keys`,
    'AllowUsers alban', 'PasswordAuthentication no', 'KbdInteractiveAuthentication no',
    'PubkeyAuthentication yes', 'AuthenticationMethods publickey', 'UsePAM yes',
    'AllowTcpForwarding yes', `PermitOpen 127.0.0.1:${echo.address().port}`, 'Compression yes',
    'PermitTTY no', 'X11Forwarding no', 'AllowAgentForwarding no', 'LogLevel ERROR', ''
  ].join('\n'), { mode: 0o600 });
  sshd = spawn('/usr/sbin/sshd', ['-D', '-e', '-f', `${temporary}/sshd_config`], { stdio: ['ignore', 'ignore', 'pipe'] });
  sshd.stderr.on('data', data => { sshdErrors = (sshdErrors + data).slice(-2000); });
  await new Promise(r => setTimeout(r, 500));
  assert.equal(sshd.exitCode, null, sshdErrors);
  const hostKey = ssh2.utils.parseKey(await readFile('/etc/ssh/ssh_host_ed25519_key.pub'));
  token = (await api('POST', '/auth/login', { username: 'root', password })).token;
  const system = await api('GET', '/system'); assert.equal(system.networkMode, 'linux');
  await api('POST', '/tunnels', { id, config: {
    ip: '10.0.0.253', ssh_port: sshPort, user: 'alban', ssh_key: '', hostFingerprint: fingerprint(hostKey.getPublicSSH()),
    options: { compression: 'yes', ServerAliveInterval: 10, ServerAliveCountMax: 3 }, bandwidth: { up: 200, down: 100 },
    tunnels: { '-L': { [listenPort]: { name: 'smoke-echo', listen_port: listenPort, listen_host: '127.0.0.1', endpoint_host: '127.0.0.1', endpoint_port: echo.address().port } }, '-R': {}, '-D': {} }
  } }); created = true;
  await api('PUT', `/tunnels/${id}/key`, { privateKey: keys.private });
  await api('POST', `/tunnels/${id}/start`);
  const socket = net.connect(listenPort, '127.0.0.1'); await once(socket, 'connect');
  async function exchange(size) {
    const payload = randomBytes(size); const received = []; let length = 0;
    const start = performance.now();
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { socket.destroy(); reject(new Error('Forwarding timed out')); }, 30000);
      const data = chunk => { received.push(chunk); length += chunk.length; if (length >= size) { clearTimeout(timeout); socket.off('data', data); resolve(); } };
      socket.once('error', error => { clearTimeout(timeout); reject(error); }); socket.on('data', data); socket.write(payload);
    });
    assert.deepEqual(Buffer.concat(received), payload);
    return Math.round(performance.now() - start);
  }
  try {
    const firstMs = await exchange(240000); assert.ok(firstMs >= 1700, `Down limit not applied: ${firstMs}ms`);
    await api('PUT', `/tunnels/${id}/bandwidth`, { up: 50, down: 200 });
    const secondMs = await exchange(120000); assert.ok(secondMs >= 1700, `Up limit not applied: ${secondMs}ms`);
    await new Promise(r => setTimeout(r, 1500));
    const state = await api('GET', `/tunnels/${id}`); assert.equal(state.status, 'running'); assert.equal(state.metrics.source, 'linux-veth');
    assert.ok(state.metrics.upBytes > 360000); assert.ok(state.metrics.downBytes > 360000);
    console.log(JSON.stringify({ https: true, ssh: 'OpenSSH standard', serviceUser: 'ostm', downTransferMs: firstMs, upTransferMs: secondMs, upBytes: state.metrics.upBytes, downBytes: state.metrics.downBytes }));
  } finally { socket.destroy(); }
  await api('POST', `/tunnels/${id}/restart`);
  assert.equal((await api('GET', `/tunnels/${id}`)).status, 'running');
} finally {
  try { if (created) await api('DELETE', `/tunnels/${id}`); }
  finally {
    for (const s of peers) s.destroy(); if (echo.listening) await new Promise(r => echo.close(r));
    if (sshd && sshd.exitCode === null) { sshd.kill(); await once(sshd, 'exit'); }
    await rm(temporary, { recursive: true, force: true });
    await rmdir(`/var/lib/ostm/keys/${id}`).catch(() => {});
    if (token) await api('POST', '/auth/logout');
  }
}
console.log('SMOKE PASS: temporary tunnel, SSH key and network resources removed.');
