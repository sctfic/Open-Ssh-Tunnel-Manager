import { readJson, writeJson } from '../utils/atomicWrite.js'
import { unlink, access } from 'node:fs/promises'

/**
 * Base class for single-file JSON repositories.
 * @abstract
 */
export class BaseJsonRepository {
  constructor({ filePath, defaultValue = null }) {
    this.filePath = filePath
    this.defaultValue = defaultValue
  }

  async _read() {
    return readJson(this.filePath, { defaultIfMissing: this.defaultValue })
  }

  async _write(data) {
    await writeJson(this.filePath, data)
  }

  async _delete() {
    try {
      await unlink(this.filePath)
      return true
    } catch (err) {
      if (err.code === 'ENOENT') return false
      throw err
    }
  }

  async exists() {
    try {
      await access(this.filePath)
      return true
    } catch {
      return false
    }
  }
}

export default BaseJsonRepository
