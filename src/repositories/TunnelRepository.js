import { readdir, access, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { readJson, writeJson, ensureDir } from '../utils/atomicWrite.js'
import { NotFoundError, ConflictError } from '../utils/errors.js'

/**
 * Repository for tunnel configurations.
 * Each tunnel is stored as a separate file: <dir>/<tunnelId>.json
 *
 * Tunnel JSON format (per spec):
 *   { id, user, ip, ssh_port, ssh_key, options, bandwidth, tunnels: { -L, -R, -D } }
 */
export class TunnelRepository {
  constructor({ dir }) {
    this.dir = dir
  }

  _filePath(id) {
    return join(this.dir, `${id}.json`)
  }

  async listIds() {
    try {
      const files = await readdir(this.dir)
      return files
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.slice(0, -5))
        .sort()
    } catch (err) {
      if (err.code === 'ENOENT') return []
      throw err
    }
  }

  async get(id) {
    try {
      return await readJson(this._filePath(id))
    } catch (err) {
      if (err.code === 'ENOENT') {
        throw new NotFoundError(`Tunnel '${id}' not found`)
      }
      throw err
    }
  }

  async exists(id) {
    try {
      await access(this._filePath(id))
      return true
    } catch {
      return false
    }
  }

  /**
   * Save a NEW tunnel (fails if it already exists).
   */
  async save(config) {
    const id = config.id
    if (!id) throw new Error('Tunnel config must contain an id')

    if (await this.exists(id)) {
      throw new ConflictError(`Tunnel '${id}' already exists`)
    }

    await ensureDir(this.dir)
    await writeJson(this._filePath(id), config)
    return config
  }

  /**
   * Overwrite an existing tunnel config entirely (no existence check).
   * Used for channel mutations.
   */
  async overwrite(id, config) {
    config.id = id
    await ensureDir(this.dir)
    await writeJson(this._filePath(id), config)
    return config
  }

  /**
   * Partial update (deep merge).
   */
  async update(id, patch) {
    const current = await this.get(id)
    const merged = deepMerge(current, patch)
    merged.id = id
    await writeJson(this._filePath(id), merged)
    return merged
  }

  async remove(id) {
    if (!(await this.exists(id))) {
      throw new NotFoundError(`Tunnel '${id}' not found`)
    }
    await unlink(this._filePath(id))
    return true
  }
}

function deepMerge(target, source) {
  const out = { ...target }
  for (const key of Object.keys(source)) {
    if (
      source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) &&
      target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])
    ) {
      out[key] = deepMerge(target[key], source[key])
    } else {
      out[key] = source[key]
    }
  }
  return out
}

export default TunnelRepository
