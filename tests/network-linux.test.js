import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import os from 'node:os';
import { LinuxTransport } from '../src/network/transport.js';

/**
 * Test privilégié facultatif. Il crée les mêmes netns/veth/qdisc que la
 * production ; il doit donc être demandé explicitement sur un hôte Linux isolé.
 */
const enabled = process.platform === 'linux' && process.getuid?.() === 0 && process.env.OSTM_LINUX_INTEGRATION === '1';
test('Linux namespace meters real network bytes and shapes both directions', { skip: !enabled && 'Requires Linux root and OSTM_LINUX_INTEGRATION=1', timeout: 45000 }, async t => {
  const address = Object.values(os.networkInterfaces()).flat().find(i => i.family === 'IPv4' && !i.internal)?.address;
  assert.ok(address, 'A non-loopback IPv4 interface is required');
  const peers = new Set(); const echo = net.createServer(s => { peers.add(s); s.on('error', () => {}); s.on('close', () => peers.delete(s)); s.pipe(s); });
  await new Promise(r => echo.listen(0, '0.0.0.0', r));
  const network = new LinuxTransport({ sudo: null, node: process.execPath }); const id = `integration-${process.pid}`; let transport;
  t.after(async () => { await transport?.close(); await network.cleanup(id); for (const s of peers) s.destroy(); await new Promise(r => echo.close(r)); });
  transport = await network.open(id, { ip: address, ssh_port: echo.address().port, bandwidth: { up: 200, down: 100 } });
  async function exchange(size) {
    // Le serveur echo renvoie exactement les octets émis : une seule opération
    // permet donc de mesurer successivement le plafond Up puis le plafond Down.
    const payload = Buffer.alloc(size, 97); let received = 0;
    await new Promise((resolve, reject) => {
      const onData = chunk => { received += chunk.length; if (received === size) { transport.socket.off('data', onData); resolve(); } };
      transport.socket.once('error', reject); transport.socket.on('data', onData); transport.socket.write(payload);
    });
  }
  let at = performance.now(); await exchange(400000); assert.ok(performance.now() - at >= 2800, 'Down traffic must be shaped to 100 Ko/s');
  const stats = await transport.stats(); assert.ok(stats.upBytes > 400000); assert.ok(stats.downBytes > 400000); assert.equal(stats.networkOverheadIncluded, true);
  await transport.limits({ up: 100, down: 1000 }); at = performance.now(); await exchange(400000); assert.ok(performance.now() - at >= 2800, 'Up traffic must be shaped independently');
  await transport.limits({ up: 0, down: 0 }); await exchange(1024);
});
