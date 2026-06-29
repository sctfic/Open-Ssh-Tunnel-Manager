import { NotFoundError, ConflictError, ValidationError } from '../utils/errors.js'

/**
 * TunnelManager — registry + lifecycle of tunnels + channels.
 *
 * Step 3 (MVP): CRUD operations delegated to TunnelRepository.
 * Step 4 will add live SSH instances for start/stop/restart.
 */
export class TunnelManager {
  constructor({ tunnelRepository, logger = console }) {
    this.repo = tunnelRepository
    this.logger = logger
    this._instances = new Map() // Map<id, TunnelInstance> (step 4)
  }

  async list(user = null) {
    const ids = await this.repo.listIds()
    let filteredIds = ids
    if (user && user.role !== 'admin') {
      const allowed = user.tunnels || []
      filteredIds = ids.filter((id) => allowed.includes(id))
    }
    return Promise.all(filteredIds.map((id) => this.repo.get(id)))
  }

  async get(id) {
    return this.repo.get(id)
  }

  async create(config) {
    const normalized = this._normalizeConfig(config)
    const saved = await this.repo.save(normalized)
    this.logger.info?.({ id: saved.id }, 'tunnel created')
    return saved
  }

  async update(id, patch) {
    const { id: _ignored, tunnels: _ignoredTunnels, ...safePatch } = patch
    const updated = await this.repo.update(id, safePatch)
    this.logger.info?.({ id }, 'tunnel updated')
    return updated
  }

  async remove(id) {
    const instance = this._instances.get(id)
    if (instance && typeof instance.stop === 'function') {
      await instance.stop()
    }
    this._instances.delete(id)
    const result = await this.repo.remove(id)
    this.logger.info?.({ id }, 'tunnel removed')
    return result
  }

  // ---- Channels ----

  async listChannels(id) {
    const cfg = await this.repo.get(id)
    return cfg.tunnels || { '-L': {}, '-R': {}, '-D': {} }
  }

  async createChannel(id, channel) {
    const { kind, listen_port } = channel
    if (!['-L', '-R', '-D'].includes(kind)) {
      throw new ValidationError(`Invalid channel kind '${kind}'`)
    }

    const cfg = await this.repo.get(id)
    cfg.tunnels = cfg.tunnels || { '-L': {}, '-R': {}, '-D': {} }
    cfg.tunnels[kind] = cfg.tunnels[kind] || {}

    const portKey = String(listen_port)
    if (cfg.tunnels[kind][portKey]) {
      throw new ConflictError(`Channel ${kind}:${portKey} already exists on tunnel '${id}'`)
    }

    const { kind: _k, ...rest } = channel
    cfg.tunnels[kind][portKey] = rest

    await this.repo.overwrite(id, cfg)
    this.logger.info?.({ id, kind, port: portKey }, 'channel created')
    return { ...rest, kind, listen_port: Number(portKey) }
  }

  async updateChannel(id, kind, port, patch) {
    const cfg = await this.repo.get(id)
    cfg.tunnels = cfg.tunnels || { '-L': {}, '-R': {}, '-D': {} }
    cfg.tunnels[kind] = cfg.tunnels[kind] || {}

    if (!cfg.tunnels[kind][port]) {
      throw new NotFoundError(`Channel ${kind}:${port} not found on tunnel '${id}'`)
    }

    cfg.tunnels[kind][port] = { ...cfg.tunnels[kind][port], ...patch }
    await this.repo.overwrite(id, cfg)
    this.logger.info?.({ id, kind, port }, 'channel updated')
    return cfg.tunnels[kind][port]
  }

  async removeChannel(id, kind, port) {
    const cfg = await this.repo.get(id)
    cfg.tunnels = cfg.tunnels || { '-L': {}, '-R': {}, '-D': {} }
    cfg.tunnels[kind] = cfg.tunnels[kind] || {}

    if (!cfg.tunnels[kind][port]) {
      throw new NotFoundError(`Channel ${kind}:${port} not found on tunnel '${id}'`)
    }

    delete cfg.tunnels[kind][port]
    await this.repo.overwrite(id, cfg)
    this.logger.info?.({ id, kind, port }, 'channel removed')
    return true
  }

  // ---- Lifecycle stubs (step 4) ----

  async start(id) {
    await this.repo.get(id)
    this.logger.info?.({ id }, 'tunnel start requested (stub)')
    return { id, status: 'stopped', message: 'SSH lifecycle not yet implemented' }
  }

  async stop(id) {
    await this.repo.get(id)
    this.logger.info?.({ id }, 'tunnel stop requested (stub)')
    return { id, status: 'stopped' }
  }

  async restart(id) {
    await this.repo.get(id)
    this.logger.info?.({ id }, 'tunnel restart requested (stub)')
    return { id, status: 'stopped', message: 'SSH lifecycle not yet implemented' }
  }

  _normalizeConfig(config) {
    const out = { ...config }
    out.tunnels = out.tunnels || {}
    out.tunnels['-L'] = out.tunnels['-L'] || {}
    out.tunnels['-R'] = out.tunnels['-R'] || {}
    out.tunnels['-D'] = out.tunnels['-D'] || {}
    out.options = out.options || {}
    out.bandwidth = out.bandwidth || {}
    return out
  }
}

export default TunnelManager
