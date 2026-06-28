import { readJson, writeJson, ensureDir } from '../utils/atomicWrite.js'

/**
 * Base class for JSON file repositories.
 *
 * Provides atomic read/write operations. Subclasses add domain-specific
 * logic (listing, filtering, etc.).
 *
 * @abstract
 */
export class BaseJsonRepository {
  /**
   * @param {object} opts
   * @param {string} opts.filePath - absolute path to the JSON file
   * @param {*}      [opts.defaultValue] - returned when file does not exist
   */
  constructor({ filePath, defaultValue = null }) {
    this.filePath = filePath
    this.defaultValue = defaultValue
  }

  /**
   * Read the JSON file, returning defaultValue when ENOENT.
   * @returns {Promise<*>}
   */
  async _read() {
    return readJson(this.filePath, { defaultIfMissing: this.defaultValue })
  }

  /**
   * Atomically write data to the JSON file.
   * @param {*} data
   */
  async _write(data) {
    await writeJson(this.filePath, data)
  }

  /**
   * Delete the JSON file (if it exists).
   * @returns {Promise<boolean>} true if the file was removed
   */
  async _delete() {
    const { unlink } = await import('node:fs/promises')
    try {
      await unlink(this.filePath)
      return true
    } catch (err) {
      if (err.code === 'ENOENT') return false
      throw err
    }
  }

  /**
   * Check whether the file exists.
   * @returns {Promise<boolean>}
   */
  async exists() {
    const { access } = await import('node:fs/promises')
    try {
      await access(this.filePath)
      return true
    } catch {
      return false
    }
  }
}

export default BaseJsonRepository
