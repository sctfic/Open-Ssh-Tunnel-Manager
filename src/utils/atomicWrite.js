import { mkdir, unlink, readFile, open as fsOpen, rename } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { JsonReadError, DiskWriteError } from './errors.js'

export async function ensureDir(dir) {
  await mkdir(dir, { recursive: true })
}

export async function readJson(filePath, { defaultIfMissing } = {}) {
  let raw
  try {
    raw = await readFile(filePath, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT' && defaultIfMissing !== undefined) return defaultIfMissing
    throw err
  }
  try {
    return JSON.parse(raw)
  } catch (err) {
    throw new JsonReadError(`Corrupted JSON in ${filePath}: ${err.message}`, { cause: err })
  }
}

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
    try { await unlink(tmp) } catch { /* ignore */ }
    throw new DiskWriteError(`Failed to write ${filePath}: ${err.message}`, { cause: err })
  }
}

export default { readJson, writeJson, ensureDir }
