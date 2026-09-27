import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.js';
import { Manager } from '../src/manager.js';
import { names, limitArgs } from '../src/network/helper.js';

// Tests de la machine d'état. Les doubles transport/session permettent de
// provoquer une panne déterministe sans attendre un serveur SSH réel.
const delay = ms => new Promise(r => setTimeout(r, ms));

test('failed connections reconnect, stop cancels retries and clears persistent desired state', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ostm-manager-')); const store = new Store(dir); await store.init();
  await store.put('alpha', { ip: 'host', user: 'user', ssh_port: 22, ssh_key: '/key', hostFingerprint: `SHA256:${'A'.repeat(43)}`, bandwidth: { up: 0, down: 0 }, tunnels: { '-L': {}, '-R': {}, '-D': {} } });
  let calls = 0, closed = 0;
  const transport = { open: async () => ({ close: async () => closed++, stats: async () => ({ upBytes: 1000, downBytes: 2000 }) }), cleanup: async () => {} };
  const manager = new Manager(store, transport, { retryMs: 10, sessionFactory: (c, tr) => ({ start: async () => { if (++calls === 1) throw new Error('offline'); }, close: () => tr.close() }) });
  t.after(async () => { await manager.close(); await rm(dir, { recursive: true, force: true }); });
  // La première connexion échoue, la seconde (lancée par le backoff) réussit.
  await assert.rejects(manager.start('alpha'), /offline/); assert.equal(manager.status('alpha').status, 'reconnecting');
  await delay(80); assert.equal(manager.status('alpha').status, 'running'); assert.equal(closed, 1);
  await manager.stop('alpha'); const count = calls; await delay(50); assert.equal(calls, count); assert.deepEqual(await store.desired(), []);
});
test('a fresh manager restores every tunnel that was running before application shutdown', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ostm-manager-')); const store = new Store(dir); await store.init();
  await store.put('alpha', { ip: 'host', user: 'user', ssh_port: 22, ssh_key: '/key', hostFingerprint: `SHA256:${'A'.repeat(43)}`, bandwidth: { up: 0, down: 0 }, tunnels: { '-L': {}, '-R': {}, '-D': {} } });
  let starts = 0;
  const transport = { open: async () => ({ close: async () => {}, stats: async () => ({ upBytes: 0, downBytes: 0 }) }), cleanup: async () => {} };
  const options = { sessionFactory: (config, opened) => ({ start: async () => { starts++; }, close: () => opened.close() }) };
  const first = new Manager(store, transport, options); let second;
  t.after(async () => { await first.close(); await second?.close(); await rm(dir, { recursive: true, force: true }); });
  await first.start('alpha'); assert.deepEqual(await store.desired(), ['alpha']);
  // Fermer l'application libère les sockets sans effacer l'intention persistée.
  await first.close();
  second = new Manager(store, transport, options); await second.init();
  assert.equal(second.status('alpha').status, 'running');
  assert.equal(second.status('alpha').desired, 'running');
  assert.equal(starts, 2);
});
test('network names are bounded and rates use decimal Ko/s in both directions', () => {
  assert.equal(names('a'.repeat(48), 3).dev.length, 12);
  assert.equal(names('alpha', 3).peer, '10.203.3.2');
  assert.ok(limitArgs('transport0', 100).includes('800000bit'));
  assert.deepEqual(limitArgs('transport0', 0), ['qdisc', 'replace', 'dev', 'transport0', 'root', 'fq_codel']);
});
