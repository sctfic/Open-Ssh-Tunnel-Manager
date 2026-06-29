import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import dotenv from 'dotenv'

<<<<<<< HEAD
=======
// Load .env if present (no-op in production where env is injected)
>>>>>>> 2a305446295e6de1ea540bcfa458df0c3ae6f10b
dotenv.config()

/**
 * Parse a "human" duration like "15m", "7d", "90s", "3600" into seconds.
<<<<<<< HEAD
 */
export function parseDurationToSeconds(value) {
  if (value === undefined || value === null || value === '') return 0
=======
 * @param {string|number} value
 * @returns {number} seconds
 */
export function parseDurationToSeconds(value) {
  if (value === undefined || value === null || value === '') {
    return 0
  }
>>>>>>> 2a305446295e6de1ea540bcfa458df0c3ae6f10b
  if (typeof value === 'number') return value
  const match = String(value).trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?$/)
  if (!match) throw new Error(`Invalid duration: ${value}`)
  const num = Number(match[1])
  switch (match[2]) {
    case 'ms': return num / 1000
    case 's': return num
    case 'm': return num * 60
    case 'h': return num * 3600
    case 'd': return num * 86400
<<<<<<< HEAD
    default: return num
  }
}

=======
    default: return num // bare number treated as seconds
  }
}

/**
 * Parse a positive integer env value, falling back to a default.
 */
>>>>>>> 2a305446295e6de1ea540bcfa458df0c3ae6f10b
function intEnv(name, def) {
  const raw = process.env[name]
  if (raw === undefined || raw === null || raw === '') return def
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
    throw new Error(`Invalid integer env var ${name}=${raw}`)
  }
  return n
}

const rootDir = resolve(fileURLToPath(import.meta.url), '..', '..')

export const config = Object.freeze({
  env: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') !== 'production',

  port: intEnv('PORT', 8080),
  host: process.env.HOST || '0.0.0.0',
<<<<<<< HEAD
=======

>>>>>>> 2a305446295e6de1ea540bcfa458df0c3ae6f10b
  logLevel: process.env.LOG_LEVEL || 'info',

  jwt: {
    secret: process.env.JWT_SECRET || (process.env.NODE_ENV === 'production'
      ? undefined
      : 'dev-insecure-secret-change-me'),
    accessSeconds: parseDurationToSeconds(process.env.JWT_EXPIRES_IN || '15m'),
    refreshSeconds: parseDurationToSeconds(process.env.JWT_REFRESH_EXPIRES_IN || '7d'),
  },

  paths: Object.freeze({
    root: rootDir,
    dataDir: resolve(rootDir, process.env.DATA_DIR || './config'),
    keysDir: resolve(rootDir, process.env.KEYS_DIR || './keys'),
    logsDir: resolve(rootDir, process.env.LOGS_DIR || './logs'),
  }),

  reconnect: Object.freeze({
    baseMs: intEnv('RECONNECT_BASE_MS', 1000),
    maxMs: intEnv('RECONNECT_MAX_MS', 30000),
  }),

  stats: Object.freeze({
    windowSec: intEnv('STATS_WINDOW_SEC', 300),
    persist24h: (process.env.STATS_24H_FILE ?? 'true') !== 'false',
  }),

  bandwidth: Object.freeze({
    bucketMs: intEnv('BANDWIDTH_BUCKET_MS', 100),
  }),
})

<<<<<<< HEAD
export function validateConfig(cfg = config) {
  const errors = []
  if (!cfg.jwt.secret) errors.push('JWT_SECRET is required in production')
=======
/** Validate that the configuration is usable (called at startup). */
export function validateConfig(cfg = config) {
  const errors = []
  if (!cfg.jwt.secret) {
    errors.push('JWT_SECRET is required in production')
  }
>>>>>>> 2a305446295e6de1ea540bcfa458df0c3ae6f10b
  if (cfg.jwt.accessSeconds <= 0) errors.push('JWT_EXPIRES_IN must be > 0')
  if (cfg.jwt.refreshSeconds <= 0) errors.push('JWT_REFRESH_EXPIRES_IN must be > 0')
  if (cfg.reconnect.baseMs <= 0) errors.push('RECONNECT_BASE_MS must be > 0')
  if (cfg.stats.windowSec <= 0) errors.push('STATS_WINDOW_SEC must be > 0')
  if (errors.length) {
    throw new Error(`Invalid configuration:\n  - ${errors.join('\n  - ')}`)
  }
  return cfg
}
