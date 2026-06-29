import { mkdirSync } from 'node:fs'
import pino from 'pino'
import { config } from './config.js'

try {
  mkdirSync(config.paths.logsDir, { recursive: true })
} catch {
  // ignore
}

export function createLogger({ level = config.logLevel, stream } = {}) {
  const baseOpts = { level, base: { app: 'ostm' } }
  if (stream) return pino(baseOpts, stream)
  return pino(baseOpts)
}

export const logger = createLogger()
export default logger
