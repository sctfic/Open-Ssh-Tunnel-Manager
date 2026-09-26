import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Duplex } from 'node:stream';
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile);
export class LinuxTransport {
  constructor({ helper = fileURLToPath(new URL('./helper.js', import.meta.url)), node = '/usr/bin/node', sudo = '/usr/bin/sudo' } = {}) { this.helper = path.resolve(helper); this.node = node; this.sudo = sudo; this.mode = 'linux'; }
  args(action, id, rest = []) { return [...(this.sudo ? ['-n', this.node] : []), this.helper, action, ...(id ? [id] : []), ...rest.map(String)]; }
  async call(action, id, rest) { const { stdout } = await exec(this.sudo || this.node, this.args(action, id, rest), { timeout: 45000, maxBuffer: 1024 * 1024 }); return stdout.trim() ? JSON.parse(stdout) : null; }
  async open(id, config) {
    const { address } = await lookup(config.ip, { family: 4 });
    await this.call('setup', id, [address, config.ssh_port, config.bandwidth.up, config.bandwidth.down]);
    const child = spawn(this.sudo || this.node, this.args('connect', id), { stdio: ['pipe', 'pipe', 'pipe'] });
    const socket = Duplex.from({ readable: child.stdout, writable: child.stdin });
    socket.on('error', () => {});
    let message = '';
    child.stderr.on('data', data => { message = (message + data).slice(-2000); });
    child.on('error', error => socket.destroy(error));
    child.on('exit', code => { if (!socket.destroyed) socket.destroy(code ? new Error(message || 'Transport exited') : undefined); });
    return {
      socket,
      limits: rates => this.call('limits', id, [rates.up, rates.down]),
      stats: () => this.call('stats', id),
      close: async () => { socket.destroy(); child.kill(); await this.call('remove', id); }
    };
  }
  async cleanup(id) { await this.call('remove', id); }
  async resources() { return this.call('list'); }
}
// Development and integration tests only: encrypted TCP bytes, no network shaping.
export class DirectTransport {
  constructor() { this.mode = 'direct'; }
  async open(id, config) {
    if (config.bandwidth.up || config.bandwidth.down) throw new Error('Bandwidth limits require Linux network mode');
    const socket = net.connect(config.ssh_port, config.ip);
    socket.setTimeout(15000, () => socket.destroy(new Error('SSH TCP connection timed out')));
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
    socket.setTimeout(0);
    return { socket, limits: async rates => { if (rates.up || rates.down) throw new Error('Bandwidth limits require Linux network mode'); }, stats: async () => ({ upBytes: socket.bytesWritten, downBytes: socket.bytesRead, source: 'tcp-payload-development', networkOverheadIncluded: false }), close: async () => socket.destroy() };
  }
  async cleanup() {}
  async resources() { return []; }
}
