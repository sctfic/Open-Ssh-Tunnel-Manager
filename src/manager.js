import { SshSession } from './ssh.js';
import { tunnel, requireThat } from './schema.js';
export class Manager {
  constructor(store, transport, { sessionFactory = (c, t, f) => new SshSession(c, t, f), retryMs = 2000 } = {}) {
    this.store = store; this.transport = transport; this.sessionFactory = sessionFactory; this.retryMs = retryMs;
    this.states = new Map(); this.wanted = new Set(); this.closing = false; this.timer = null;
  }
  state(id) { if (!this.states.has(id)) this.states.set(id, { status: 'stopped', attempt: 0 }); return this.states.get(id); }
  status(id) { const { status, error, metrics, attempt } = this.state(id); return { status, error: error || null, metrics: metrics || null, reconnectAttempts: attempt, desired: this.wanted.has(id) ? 'running' : 'stopped' }; }
  async init() {
    this.wanted = new Set(await this.store.desired());
    const configs = await this.store.configs();
    for (const id of this.wanted) {
      if (!configs[id]) { this.wanted.delete(id); continue; }
      // Bring stale network resources under management without killing unrelated SSH processes.
      await this.store.exclusive(() => this.launch(id)).catch(() => {});
    }
    await this.store.setDesired([...this.wanted]);
    this.timer = setInterval(() => this.sample().catch(() => {}), 1000); this.timer.unref();
  }
  async start(id) {
    await this.store.get(id); this.wanted.add(id); await this.store.setDesired([...this.wanted]);
    const s = this.state(id); if (s.status === 'running') return this.status(id);
    clearTimeout(s.retry); await this.launch(id); return this.status(id);
  }
  async launch(id) {
    const s = this.state(id); if (this.closing || !this.wanted.has(id)) return;
    s.status = 'starting'; s.error = null;
    try {
      const config = tunnel.parse(await this.store.get(id));
      requireThat(config.ssh_key, 422, 'SSH key is required; provision this tunnel first');
      s.transport = await this.transport.open(id, config);
      s.session = this.sessionFactory(config, s.transport, error => {
        this.store.exclusive(async () => { if (s.status === 'running') await this.failed(id, error); }).catch(() => {});
      });
      let timer;
      try { await Promise.race([s.session.start(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Tunnel startup timed out')), 30000); })]); }
      finally { clearTimeout(timer); }
      s.status = 'running'; s.attempt = 0; s.metrics = null; s.previous = null;
    } catch (e) { await this.failed(id, e); throw e; }
  }
  async cleanup(s) {
    const session = s.session, transport = s.transport;
    s.session = null; s.transport = null; s.metrics = null; s.previous = null;
    if (session) await session.close(); else if (transport) await transport.close();
  }
  async failed(id, error) {
    const s = this.state(id); s.status = 'error'; s.error = error.message; s.attempt++;
    try { await this.cleanup(s); } catch (e) { s.error += `; cleanup: ${e.message}`; }
    if (!this.closing && this.wanted.has(id)) {
      s.status = 'reconnecting';
      clearTimeout(s.retry);
      s.retry = setTimeout(() => this.store.exclusive(() => this.launch(id)).catch(() => {}), Math.min(60000, this.retryMs * 2 ** Math.min(s.attempt - 1, 5))); s.retry.unref();
    }
  }
  async stop(id) {
    await this.store.get(id); this.wanted.delete(id); await this.store.setDesired([...this.wanted]);
    const s = this.state(id); clearTimeout(s.retry); s.status = 'stopping';
    try { await this.cleanup(s); await this.transport.cleanup(id); s.status = 'stopped'; s.error = null; }
    catch (e) { s.status = 'error'; s.error = e.message; throw e; }
    return this.status(id);
  }
  async restart(id) { await this.stop(id); return this.start(id); }
  async updateLimits(id, rates) { const s = this.state(id); if (s.transport) await s.transport.limits(rates); }
  async sample() {
    if (this.sampling) return; this.sampling = true;
    try {
      for (const s of this.states.values()) if (s.status === 'running' && s.transport) {
        const transport = s.transport;
        try {
          const current = await transport.stats(), now = performance.now();
          if (s.transport !== transport) continue;
          const previous = s.previous; const seconds = previous ? (now - previous.at) / 1000 : 0;
          s.metrics = { ...current, upKoPerSecond: seconds ? Math.max(0, current.upBytes - previous.upBytes) / seconds / 1000 : 0, downKoPerSecond: seconds ? Math.max(0, current.downBytes - previous.downBytes) / seconds / 1000 : 0, measuredAt: new Date().toISOString(), downEnforcement: 'local-reception' };
          s.previous = { ...current, at: now };
        } catch (e) { s.metrics = { error: e.message, measuredAt: new Date().toISOString() }; }
      }
    } finally { this.sampling = false; }
  }
  async close() {
    this.closing = true; clearInterval(this.timer);
    for (const s of this.states.values()) { clearTimeout(s.retry); await this.cleanup(s).catch(() => {}); }
  }
}
