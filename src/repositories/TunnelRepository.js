import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { BaseJsonRepository } from './BaseJsonRepository.js'
import { NotFoundError, ConflictError } from '../utils/errors.js'

/**
 * Repository for tunnel configurations.
 *
 * Each tunnel is stored as a separate JSON file in `dir/`:
 *   <dir>/<tunnelId>.json
 *
 * The tunnel JSON format matches the specification exactly:
 *   { id, user, ip, ssh_port, ssh_key, options, bandwidth, tunnels: { -L, -R, -D } }
 */
export class TunnelRepository {
  /**
   * @param {object} opts
   * @param {string} opts.dir - directory containing `<id>.json` files
   */
  constructor({ dir }) {
    this.dir = dir
  }

  /**
   * Path to the JSON file for a given tunnel id.
   * @param {string} id
   */
  _filePath(id) {
    return join(this.dir, `${id}.json`)
  }

  /**
   * List all tunnel IDs (file names without .json extension).
   * @returns {Promise<string[]>}
   */
  async listIds() {
    try {
      const files = await readdir(this.dir)
      return files
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.slice(0, -5)) // strip .json
        .sort()
    } catch (err) {
      if (err.code === 'ENOENT') return []
      throw err
    }
  }

  /**
   * Get a tunnel config by id.
   * @param {string} id
   * @returns {Promise<object>}
   * @throws {NotFoundError}
   */
  async get(id) {
    const { readJson } = await import('../utils/atomicWrite.js')
    try {
      return await readJson(this._filePath(id))
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new NotFoundError(`Tunnel '${id}' not found`)
      }
      throw err
    }
  }

  /**
   * Check if a tunnel exists.
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async exists(id) {
    const { access } = await import('node:fs/promises')
    try {
      await access(this._filePath(id))
      return true
    } catch {
      return false
    }
  }

  /**
   * Save a new tunnel config. Fails if a file already exists.
   * @param {object} config - full tunnel config (must contain `id`)
   * @returns {Promise<object>} the saved config
   * @throws {ConflictError} if tunnel id already exists
   */
  async save(config) {
    const id = config.id
    if (!id) {
      throw new Error('Tunnel config must contain an id')
    }

    const already = await this.exists(id)
    if (already) {
      throw new ConflictError(`Tunnel '${id}' already exists`)
    }

    const { writeJson, ensureDir } = await import('../utils/atomicWrite.js')
    await ensureDir(this.dir)
    await writeJson(this._filePath(id), config)
    return config
  }

  /**
   * Overwrite the entire config for an existing tunnel (no existence check).
   * Used internally by TunnelManager for channel mutations.
   * @param {string} id
   * @param {object} config - full tunnel config
   */
  async overwrite(id, config) {
    config.id = id // ensure id is set
    await ensureDir(this.dir)
    await writeJson(this._filePath(id), config)
    return config
  }

  /**
   * Update an existing tunnel config (partial or full).
   * @param {string} id
   * @param {object} patch - fields to merge/overwrite
   * @returns {Promise<object>} the merged config
   * @throws {NotFoundError} if tunnel does not exist
   */
  async update(id, patch) {
    const current = await this.get(id)
    const merged = deepMerge(current, patch)
    merged.id = id // id is immutable
    const { writeJson } = await import('../utils/atomicWrite.js')
    await writeJson(this._filePath(id), merged)
    return merged
  }

  /**
   * Remove a tunnel config file.
   * @param {string} id
   * @returns {Promise<boolean>} true if removed, false if not found
   * @throws {NotFoundError} if tunnel does not exist
   */
  async remove(id) {
    if (!(await this.exists(id))) {
      throw new NotFoundError(`Tunnel '${id}' not found`)
    }
    const { unlink } = await import('node:fs/promises')
    await unlink(this._filePath(id))
    return true
  }
}

/**
 * Deep merge two plain objects (target wins on leaf conflicts).
 * Arrays are replaced, not concatenated.
 */
function deepMerge(target, source) {
  const out = { ...target }
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      out[key] = deepMerge(target[key], source[key])
    } else {
      out[key] = source[key]
    }
  }
  return out
}

export default TunnelRepository
