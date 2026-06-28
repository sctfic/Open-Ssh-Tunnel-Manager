import { mkdirSync, createWriteStream } from 'node:fs'
import { resolve } from 'node:path'
import pino from 'pino'
import { config } from './config.js'

// Ensure the logs directory exists at startup (best-effort).
try {
  mkdirSync(config.paths.logsDir, { recursive: true })
} catch {
  // ignore (may be read-only in some test contexts)
}

/**
 * Build the Pino logger.
 *
 * In dev: pretty-print to stdout for readability.
 * In prod: ndjson to stdout AND to logs/app.log (multistream) for archival.
 *
 * A custom stream can be injected (used in tests to silence/capture output).
 */
export function createLogger({ level = config.logLevel, stream } = {}) {
  const baseOpts = { level, base: { app: 'ostm' } }

  if (stream) {
    return pino(baseOpts, stream)
  }

  if (config.isDev) {
    return pino(baseOpts, pino.destination(1 /* stdout */))
  }

  // Production: stdout + rotating app.log
  const fileStream = createWriteStream(
    resolve(config.paths.logsDir, 'app.log'),
    { flags: 'a' }
  )
  return pino(
    baseOpts,
    pino.multistream([
      { stream: process.stdout },
      { stream: fileStream },
    ])
  )
}

export const logger = createLogger()

export default logger
