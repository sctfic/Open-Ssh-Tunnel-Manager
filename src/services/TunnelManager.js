import { NotFoundError, ConflictError, ValidationError } from '../utils/errors.js'

/**
<<<<<<< HEAD
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
=======
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
>>>>>>> 2a305446295e6de1ea540bcfa458df0c3ae6f10b
    if (user && user.role !== 'admin') {
      const allowed = user.tunnels || []
      filteredIds = ids.filter((id) => allowed.includes(id))
    }
<<<<<<< HEAD
    return Promise.all(filteredIds.map((id) => this.repo.get(id)))
  }

=======

    const configs = await Promise.all(filteredIds.map((id) => this.repo.get(id)))
    return configs
  }

  /**
   * Get a single tunnel config.
   * @param {string} id
   * @returns {Promise<object>}
   */
>>>>>>> 2a305446295e6de1ea540bcfa458df0c3ae6f10b
  async get(id) {
    return this.repo.get(id)
  }

<<<<<<< HEAD
  async create(config) {
=======
  // ---- CRUD ----

  /**
   * Create a new tunnel (persisted + loaded in registry).
   * @param {object} config - full tunnel config
   * @returns {Promise<object>} saved config
   */
  async create(config) {
    // Normalize the tunnels object structure
>>>>>>> 2a305446295e6de1ea540bcfa458df0c3ae6f10b
    const normalized = this._normalizeConfig(config)
    const saved = await this.repo.save(normalized)
    this.logger.info?.({ id: saved.id }, 'tunnel created')
    return saved
  }

<<<<<<< HEAD
  async update(id, patch) {
=======
  /**
   * Update a tunnel's top-level fields (not channels — use channel routes).
   * @param {string} id
   * @param {object} patch
   * @returns {Promise<object>}
   */
  async update(id, patch) {
    // Strip forbidden fields
>>>>>>> 2a305446295e6de1ea540bcfa458df0c3ae6f10b
    const { id: _ignored, tunnels: _ignoredTunnels, ...safePatch } = patch
    const updated = await this.repo.update(id, safePatch)
    this.logger.info?.({ id }, 'tunnel updated')
    return updated
  }

<<<<<<< HEAD
=======
  /**
   * Delete a tunnel and stop its instance if running.
   * @param {string} id
   * @returns {Promise<boolean>}
   */
>>>>>>> 2a305446295e6de1ea540bcfa458df0c3ae6f10b
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

<<<<<<< HEAD
  // ---- Channels ----

=======
  // ---- Channels (sub-resources inside the tunnels object) ----

  /**
   * List channels of a tunnel.
   * @param {string} id - tunnel id
   * @returns {Promise<object>} { '-L': {...}, '-R': {...}, '-D': {...} }
   */
>>>>>>> 2a305446295e6de1ea540bcfa458df0c3ae6f10b
  async listChannels(id) {
    const cfg = await this.repo.get(id)
    return cfg.tunnels || { '-L': {}, '-R': {}, '-D': {} }
  }

<<<<<<< HEAD
=======
  /**
   * Add a channel to a tunnel.
   * @param {string} id - tunnel id
   * @param {object} channel - { kind, listen_port, ... }
   * @returns {Promise<object>} the created channel
   */
>>>>>>> 2a305446295e6de1ea540bcfa458df0c3ae6f10b
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
<<<<<<< HEAD
      throw new ConflictError(`Channel ${kind}:${portKey} already exists on tunnel '${id}'`)
    }

=======
      throw new ConflictError(
        `Channel ${kind}:${portKey} already exists on tunnel '${id}'`
      )
    }

    // Store without the 'kind' discriminator (it is the map key)
>>>>>>> 2a305446295e6de1ea540bcfa458df0c3ae6f10b
    const { kind: _k, ...rest } = channel
    cfg.tunnels[kind][portKey] = rest

    await this.repo.overwrite(id, cfg)
    this.logger.info?.({ id, kind, port: portKey }, 'channel created')
    return { ...rest, kind, listen_port: Number(portKey) }
  }

<<<<<<< HEAD
=======
  /**
   * Update a channel.
   * @param {string} id
   * @param {string} kind - '-L' | '-R' | '-D'
   * @param {string} port - listen_port (string key)
   * @param {object} patch
   * @returns {Promise<object>}
   */
>>>>>>> 2a305446295e6de1ea540bcfa458df0c3ae6f10b
  async updateChannel(id, kind, port, patch) {
    const cfg = await this.repo.get(id)
    cfg.tunnels = cfg.tunnels || { '-L': {}, '-R': {}, '-D': {} }
    cfg.tunnels[kind] = cfg.tunnels[kind] || {}

    if (!cfg.tunnels[kind][port]) {
<<<<<<< HEAD
      throw new NotFoundError(`Channel ${kind}:${port} not found on tunnel '${id}'`)
=======
      throw new NotFoundError(
        `Channel ${kind}:${port} not found on tunnel '${id}'`
      )
>>>>>>> 2a305446295e6de1ea540bcfa458df0c3ae6f10b
    }

    cfg.tunnels[kind][port] = { ...cfg.tunnels[kind][port], ...patch }
    await this.repo.overwrite(id, cfg)
    this.logger.info?.({ id, kind, port }, 'channel updated')
    return cfg.tunnels[kind][port]
  }

<<<<<<< HEAD
=======
  /**
   * Remove a channel.
   * @param {string} id
   * @param {string} kind
   * @param {string} port
   * @returns {Promise<boolean>}
   */
>>>>>>> 2a305446295e6de1ea540bcfa458df0c3ae6f10b
  async removeChannel(id, kind, port) {
    const cfg = await this.repo.get(id)
    cfg.tunnels = cfg.tunnels || { '-L': {}, '-R': {}, '-D': {} }
    cfg.tunnels[kind] = cfg.tunnels[kind] || {}

    if (!cfg.tunnels[kind][port]) {
<<<<<<< HEAD
      throw new NotFoundError(`Channel ${kind}:${port} not found on tunnel '${id}'`)
=======
      throw new NotFoundError(
        `Channel ${kind}:${port} not found on tunnel '${id}'`
      )
>>>>>>> 2a305446295e6de1ea540bcfa458df0c3ae6f10b
    }

    delete cfg.tunnels[kind][port]
    await this.repo.overwrite(id, cfg)
    this.logger.info?.({ id, kind, port }, 'channel removed')
    return true
  }

<<<<<<< HEAD
  // ---- Lifecycle stubs (step 4) ----

  async start(id) {
    await this.repo.get(id)
=======
  // ---- Lifecycle (stubs — implemented in step 4) ----

  /**
   * Start a tunnel (open SSH connection + channels).
   * Stub for step 3; full impl in step 4.
   */
  async start(id) {
    await this.repo.get(id) // ensure it exists
>>>>>>> 2a305446295e6de1ea540bcfa458df0c3ae6f10b
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

<<<<<<< HEAD
=======
  // ---- Helpers ----

  /**
   * Ensure the tunnel config has a well-formed tunnels object.
   * @private
   */
>>>>>>> 2a305446295e6de1ea540bcfa458df0c3ae6f10b
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
