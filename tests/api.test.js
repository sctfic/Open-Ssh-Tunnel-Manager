import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '../src/app.js';
import { hashPassword } from '../src/auth.js';

/**
 * Tests de contrat HTTP. Le FakeManager isole les règles API et ACL du réseau :
 * les échanges SSH réels sont couverts séparément dans ssh.test.js.
 */
const config = () => ({ ip: '127.0.0.1', user: 'tester', ssh_port: 22, ssh_key: '', hostFingerprint: `SHA256:${'A'.repeat(43)}`, bandwidth: { up: 0, down: 0 }, tunnels: { '-L': {}, '-R': {}, '-D': {} } });
const secret = 'test-password-long-enough';
class FakeManager {
  // Même interface publique que Manager, sans ouvrir de socket ni de processus.
  constructor() { this.states = new Map(); this.calls = []; }
  state(key) { if (!this.states.has(key)) this.states.set(key, { status: 'stopped', desired: 'stopped' }); return this.states.get(key); }
  status(key) { return this.state(key); }
  async start(key) { this.calls.push(['start', key]); Object.assign(this.state(key), { status: 'running', desired: 'running' }); return this.state(key); }
  async stop(key) { Object.assign(this.state(key), { status: 'stopped', desired: 'stopped' }); return this.state(key); }
  async restart(key) { return this.start(key); }
  async updateLimits(key, rates) { this.calls.push(['limits', key, rates]); }
  async close() {}
}
async function fixture(t) {
  // Chaque test reçoit un répertoire de données et des sessions neufs. `t.after`
  // garantit le nettoyage même lorsqu'une assertion échoue.
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ostm-api-')); const manager = new FakeManager();
  const app = await buildApp({ dataDir: dir, manager, restore: false });
  const hash = await hashPassword(secret); const users = {};
  for (const username of ['root', 'reader', 'executor', 'writer', 'manager', 'outsider']) users[username] = { passwordHash: hash, rights: {}, disabled: false };
  for (const [username, n] of [['reader', 1], ['executor', 2], ['writer', 3], ['manager', 4]]) users[username].rights.alpha = n;
  await app.services.store.saveUsers(users); await app.services.store.put('alpha', config()); await app.services.store.put('hidden', config());
  const tokens = {};
  for (const username of Object.keys(users)) {
    const r = await app.inject({ method: 'POST', url: '/api/v2/auth/login', payload: { username, password: secret } }); assert.equal(r.statusCode, 200); tokens[username] = r.json().token;
  }
  t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); });
  const call = (username, method, url, payload) => app.inject({ method, url: `/api/v2${url}`, headers: username ? { authorization: `Bearer ${tokens[username]}` } : {}, ...(payload === undefined ? {} : { payload }) });
  return { app, call, manager, dir, tokens };
}

test('authentication protects reads and all execution endpoints', async t => {
  const { call } = await fixture(t);
  for (const action of ['start', 'stop', 'restart']) assert.equal((await call(null, 'POST', `/tunnels/alpha/${action}`)).statusCode, 401);
  assert.equal((await call(null, 'GET', '/tunnels')).statusCode, 401);
  assert.equal((await call('root', 'GET', '/tunnels/alpha/start')).statusCode, 404);
});
test('permission ladder controls actions, editing, management and visibility', async t => {
  // Cette table implicite vérifie que chaque niveau inclut les niveaux inférieurs.
  const { call, manager } = await fixture(t);
  assert.deepEqual((await call('reader', 'GET', '/tunnels')).json().map(x => x.id), ['alpha']);
  assert.equal((await call('outsider', 'GET', '/tunnels/alpha')).statusCode, 403);
  assert.equal((await call('reader', 'POST', '/tunnels/alpha/start')).statusCode, 403);
  for (const user of ['executor', 'writer', 'manager', 'root']) assert.equal((await call(user, 'POST', '/tunnels/alpha/start')).statusCode, 200);
  assert.equal((await call('executor', 'PUT', '/tunnels/alpha/bandwidth', { up: 10, down: 20 })).statusCode, 403);
  assert.equal((await call('writer', 'PUT', '/tunnels/alpha/bandwidth', { up: 10, down: 20 })).statusCode, 200);
  assert.equal((await call('writer', 'PUT', '/tunnels/alpha/rights/reader', { level: 4 })).statusCode, 403);
  assert.equal((await call('manager', 'PUT', '/tunnels/hidden/rights/reader', { level: 4 })).statusCode, 403);
  assert.equal((await call('manager', 'PUT', '/tunnels/alpha/rights/reader', { level: 4 })).statusCode, 200);
  manager.calls = []; await call('executor', 'POST', '/actions/start'); assert.deepEqual(manager.calls, [['start', 'alpha']]);
});
test('root is immutable and rights revocation applies to an existing session', async t => {
  const { call } = await fixture(t);
  for (const user of ['manager', 'root']) assert.equal((await call(user, 'PUT', '/tunnels/alpha/rights/root', { level: 0 })).statusCode, 403);
  assert.equal((await call('root', 'PATCH', '/users/root', { disabled: true })).statusCode, 403);
  assert.equal((await call('root', 'DELETE', '/users/root')).statusCode, 403);
  await call('manager', 'PUT', '/tunnels/alpha/rights/executor', { level: 0 });
  assert.equal((await call('executor', 'POST', '/tunnels/alpha/start')).statusCode, 403);
  await call('root', 'PATCH', '/users/reader', { disabled: true });
  assert.equal((await call('reader', 'GET', '/tunnels')).statusCode, 401);
});
test('only root creates users while manage creates tunnels and deleted ACLs are cleared', async t => {
  const { call, app } = await fixture(t);
  assert.equal((await call('writer', 'POST', '/users', { username: 'newuser', password: secret })).statusCode, 403);
  assert.equal((await call('manager', 'POST', '/users', { username: 'newuser', password: secret })).statusCode, 403);
  assert.equal((await call('root', 'POST', '/users', { username: 'newuser', password: secret })).statusCode, 201);
  assert.deepEqual((await app.services.store.users()).newuser.rights, {});
  const r = await call('manager', 'POST', '/tunnels', { id: 'beta', config: config() }); assert.equal(r.statusCode, 201); assert.equal(r.json().level, 4);
  await call('manager', 'PUT', '/tunnels/beta/rights/reader', { level: 1 });
  assert.equal((await call('writer', 'DELETE', '/tunnels/alpha')).statusCode, 403);
  assert.equal((await call('manager', 'DELETE', '/tunnels/beta')).statusCode, 200);
  assert.equal((await app.services.store.users()).reader.rights.beta, undefined);
});
test('first setup creates root once and leaves every other API route protected', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ostm-setup-')); const app = await buildApp({ dataDir: dir, manager: new FakeManager(), restore: false });
  t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); });
  assert.deepEqual((await app.inject({ method: 'GET', url: '/api/v2/setup/status' })).json(), { required: true });
  const page = await app.inject({ method: 'GET', url: '/' }); assert.equal(page.statusCode, 200); assert.match(page.headers['content-type'], /text\/html/);
  const asset = await app.inject({ method: 'GET', url: '/assets/js/app.js' }); assert.equal(asset.statusCode, 200); assert.match(asset.headers['content-type'], /javascript/);
  assert.equal((await app.inject({ method: 'GET', url: '/api/v2/tunnels' })).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/api/v2/setup', payload: { password: secret } })).statusCode, 201);
  assert.deepEqual((await app.inject({ method: 'GET', url: '/api/v2/setup/status' })).json(), { required: false });
  assert.equal((await app.inject({ method: 'POST', url: '/api/v2/setup', payload: { password: secret } })).statusCode, 409);
  assert.equal((await app.inject({ method: 'POST', url: '/api/v2/auth/login', payload: { username: 'root', password: secret } })).statusCode, 200);
});
test('the owner may deliberately use an empty password', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ostm-empty-password-')); const app = await buildApp({ dataDir: dir, manager: new FakeManager(), restore: false });
  t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); });
  assert.equal((await app.inject({ method: 'POST', url: '/api/v2/setup', payload: { password: '' } })).statusCode, 201);
  const login = await app.inject({ method: 'POST', url: '/api/v2/auth/login', payload: { username: 'root', password: '' } }); assert.equal(login.statusCode, 200);
  const token = login.json().token;
  assert.equal((await app.inject({ method: 'PUT', url: '/api/v2/auth/password', headers: { authorization: `Bearer ${token}` }, payload: { currentPassword: '', password: '' } })).statusCode, 200);
});
test('validation rejects traversal, arbitrary key paths, unknown configuration and bad channels', async t => {
  const { call } = await fixture(t);
  for (const bad of ['../escape', '-option', 'a/b']) assert.equal((await call('root', 'POST', '/tunnels', { id: bad, config: config() })).statusCode, 400);
  assert.equal((await call('root', 'POST', '/tunnels', { id: 'bad', config: { ...config(), ssh_key: '/etc/passwd' } })).statusCode, 400);
  assert.equal((await call('root', 'PUT', '/tunnels/alpha', { ...config(), channels: {} })).statusCode, 400);
  assert.equal((await call('writer', 'POST', '/tunnels/alpha/channels', { type: '-L', name: 'bad', listen_port: 4321 })).statusCode, 400);
  assert.equal((await call('writer', 'POST', '/tunnels/alpha/channels', { type: '-D', name: 'socks', listen_port: 4321 })).statusCode, 201);
  assert.equal((await call('writer', 'POST', '/tunnels/alpha/channels', { type: '-D', name: 'socks', listen_port: 4321 })).statusCode, 409);
  await call('writer', 'POST', '/tunnels/alpha/start');
  assert.equal((await call('writer', 'PUT', '/tunnels/alpha', config())).statusCode, 409);
});
test('logout invalidates the token and password hashes never appear in user lists', async t => {
  const { call } = await fixture(t);
  const r = await call('root', 'GET', '/users'); assert.equal(r.statusCode, 200); assert.equal(r.body.includes('scrypt'), false);
  await call('reader', 'POST', '/auth/logout'); assert.equal((await call('reader', 'GET', '/auth/me')).statusCode, 401);
});
test('live SSE filters tunnels, applies revocation and closes after logout', { timeout: 30000 }, async t => {
  // Contrairement à app.inject(), un vrai port est nécessaire pour vérifier une
  // réponse HTTP maintenue ouverte pendant plusieurs événements SSE.
  const { app, call, tokens } = await fixture(t);
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const controller = new AbortController();
  const response = await fetch(`${address}/api/v2/events`, { headers: { authorization: `Bearer ${tokens.reader}` }, signal: controller.signal });
  assert.equal(response.status, 200); const stream = response.body.getReader();
  try {
    const first = new TextDecoder().decode((await stream.read()).value); assert.match(first, /"id":"alpha"/); assert.doesNotMatch(first, /"id":"hidden"/);
    await call('manager', 'PUT', '/tunnels/alpha/rights/reader', { level: 0 });
    const next = new TextDecoder().decode((await stream.read()).value); assert.match(next, /data: \[\]/);
    await call('reader', 'POST', '/auth/logout'); assert.equal((await stream.read()).done, true);
  } finally { controller.abort(); await stream.cancel().catch(() => {}); }
});
