import { rename, mkdir, unlink, readFile, open as fsOpen } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { JsonReadError, DiskWriteError } from './errors.js'

/**
 * Ensure a directory exists (recursive). Best-effort; propagates fs errors.
 */
export async function ensureDir(dir) {
  await mkdir(dir, { recursive: true })
}

/**
 * Read and JSON.parse a file.
 *
 * @param {string} filePath absolute path
 * @param {object} [opts]
 * @param {*} [opts.defaultIfMissing] if provided, return this when ENOENT
 * @returns {Promise<*>} parsed JSON
 * @throws {JsonReadError} on parse failure
 * @throws {Error} rethrown fs error (ENOENT unless defaultIfMissing)
 */
export async function readJson(filePath, { defaultIfMissing } = {}) {
  let raw
  try {
    raw = await readFile(filePath, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT' && defaultIfMissing !== undefined) {
      return defaultIfMissing
    }
    throw err
  }
  try {
    return JSON.parse(raw)
  } catch (err) {
    throw new JsonReadError(`Corrupted JSON in ${filePath}: ${err.message}`, { cause: err })
  }
}

/**
 * Atomically write JSON to a file.
 *
 * Strategy: write to a temp file `<name>.<rand>.tmp` in the same directory,
 * fsync it, then rename over the target. Rename is atomic on POSIX (and on
 * Windows when on the same volume). This prevents half-written files on crash.
 *
 * @param {string} filePath absolute path
 * @param {*} data serialisable value
 * @param {object} [opts]
 * @param {boolean} [opts.fsync=true] fsync the temp file before rename
 * @throws {DiskWriteError} on write/rename failure
 */
export async function writeJson(filePath, data, { fsync = true } = {}) {
  const dir = dirname(filePath)
  await ensureDir(dir)

  const tmp = join(dir, `.${randomBytes(6).toString('hex')}.tmp`)
  const payload = JSON.stringify(data, null, 2)

  let handle
  try {
    handle = await fsOpen(tmp, 'w', 0o600)
    await handle.writeFile(payload, 'utf8')
    if (fsync) await handle.sync()
    await handle.close()
    handle = null
    await rename(tmp, filePath)
  } catch (err) {
    if (handle) {
      try { await handle.close() } catch { /* ignore */ }
    }
    // Cleanup temp file best-effort (ignore errors, file may not exist)
    try { await unlink(tmp) } catch { /* ignore */ }
    throw new DiskWriteError(`Failed to write ${filePath}: ${err.message}`, { cause: err })
  }
}

export default { readJson, writeJson, ensureDir }
