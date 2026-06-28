import { NotFoundError, ConflictError, ValidationError } from '../utils/errors.js'

/**
 * TunnelManager — registry + lifecycle of tunnels.
 *
 * At this stage (step 3, MVP), it manages:
 *   - CRUD operations (delegated to TunnelRepository)
 *   - An in-memory registry of "loaded" tunnel configs
 *
 * In step 4, it will additionally instantiate TunnelInstance objects
 * (live SSH connections) and wire them to start/stop/restart.
 *
 * Channel management (-L/-R/-D sub-objects) is also handled here because
 * channels live *inside* the tunnel JSON file.
 */
export class TunnelManager {
  /**
   * @param {object} opts
   * @param {import('../repositories/TunnelRepository.js').TunnelRepository} opts.tunnelRepository
   * @param {object} [opts.logger]
   */
  constructor({ tunnelRepository, logger = console }) {
    this.repo = tunnelRepository
    this.logger = logger
    // Map<id, TunnelInstance> — populated in step 4
    this._instances = new Map()
  }

  // ---- Listing & lookup ----

  /**
   * List all tunnel configurations.
   * @param {object} [user] - optional authenticated user (for scope filtering)
   * @returns {Promise<object[]>} array of tunnel configs
   */
  async list(user = null) {
    const ids = await this.repo.listIds()
    let filteredIds = ids

    // Tech users can only see tunnels they are scoped to
    if (user && user.role !== 'admin') {
      const allowed = user.tunnels || []
      filteredIds = ids.filter((id) => allowed.includes(id))
    }

    const configs = await Promise.all(filteredIds.map((id) => this.repo.get(id)))
    return configs
  }

  /**
   * Get a single tunnel config.
   * @param {string} id
   * @returns {Promise<object>}
   */
  async get(id) {
    return this.repo.get(id)
  }

  // ---- CRUD ----

  /**
   * Create a new tunnel (persisted + loaded in registry).
   * @param {object} config - full tunnel config
   * @returns {Promise<object>} saved config
   */
  async create(config) {
    // Normalize the tunnels object structure
    const normalized = this._normalizeConfig(config)
    const saved = await this.repo.save(normalized)
    this.logger.info?.({ id: saved.id }, 'tunnel created')
    return saved
  }

  /**
   * Update a tunnel's top-level fields (not channels — use channel routes).
   * @param {string} id
   * @param {object} patch
   * @returns {Promise<object>}
   */
  async update(id, patch) {
    // Strip forbidden fields
    const { id: _ignored, tunnels: _ignoredTunnels, ...safePatch } = patch
    const updated = await this.repo.update(id, safePatch)
    this.logger.info?.({ id }, 'tunnel updated')
    return updated
  }

  /**
   * Delete a tunnel and stop its instance if running.
   * @param {string} id
   * @returns {Promise<boolean>}
   */
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

  // ---- Channels (sub-resources inside the tunnels object) ----

  /**
   * List channels of a tunnel.
   * @param {string} id - tunnel id
   * @returns {Promise<object>} { '-L': {...}, '-R': {...}, '-D': {...} }
   */
  async listChannels(id) {
    const cfg = await this.repo.get(id)
    return cfg.tunnels || { '-L': {}, '-R': {}, '-D': {} }
  }

  /**
   * Add a channel to a tunnel.
   * @param {string} id - tunnel id
   * @param {object} channel - { kind, listen_port, ... }
   * @returns {Promise<object>} the created channel
   */
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
      throw new ConflictError(
        `Channel ${kind}:${portKey} already exists on tunnel '${id}'`
      )
    }

    // Store without the 'kind' discriminator (it is the map key)
    const { kind: _k, ...rest } = channel
    cfg.tunnels[kind][portKey] = rest

    await this.repo.overwrite(id, cfg)
    this.logger.info?.({ id, kind, port: portKey }, 'channel created')
    return { ...rest, kind, listen_port: Number(portKey) }
  }

  /**
   * Update a channel.
   * @param {string} id
   * @param {string} kind - '-L' | '-R' | '-D'
   * @param {string} port - listen_port (string key)
   * @param {object} patch
   * @returns {Promise<object>}
   */
  async updateChannel(id, kind, port, patch) {
    const cfg = await this.repo.get(id)
    cfg.tunnels = cfg.tunnels || { '-L': {}, '-R': {}, '-D': {} }
    cfg.tunnels[kind] = cfg.tunnels[kind] || {}

    if (!cfg.tunnels[kind][port]) {
      throw new NotFoundError(
        `Channel ${kind}:${port} not found on tunnel '${id}'`
      )
    }

    cfg.tunnels[kind][port] = { ...cfg.tunnels[kind][port], ...patch }
    await this.repo.overwrite(id, cfg)
    this.logger.info?.({ id, kind, port }, 'channel updated')
    return cfg.tunnels[kind][port]
  }

  /**
   * Remove a channel.
   * @param {string} id
   * @param {string} kind
   * @param {string} port
   * @returns {Promise<boolean>}
   */
  async removeChannel(id, kind, port) {
    const cfg = await this.repo.get(id)
    cfg.tunnels = cfg.tunnels || { '-L': {}, '-R': {}, '-D': {} }
    cfg.tunnels[kind] = cfg.tunnels[kind] || {}

    if (!cfg.tunnels[kind][port]) {
      throw new NotFoundError(
        `Channel ${kind}:${port} not found on tunnel '${id}'`
      )
    }

    delete cfg.tunnels[kind][port]
    await this.repo.overwrite(id, cfg)
    this.logger.info?.({ id, kind, port }, 'channel removed')
    return true
  }

  // ---- Lifecycle (stubs — implemented in step 4) ----

  /**
   * Start a tunnel (open SSH connection + channels).
   * Stub for step 3; full impl in step 4.
   */
  async start(id) {
    await this.repo.get(id) // ensure it exists
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

  // ---- Helpers ----

  /**
   * Ensure the tunnel config has a well-formed tunnels object.
   * @private
   */
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
