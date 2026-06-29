import { buildApp } from '../../src/app.js'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pino from 'pino'
import bcrypt from 'bcrypt'

// Pre-computed bcrypt hashes for speed (cost=4).
// Generated once at module load, reused across all tests.
const ADMIN_HASH = bcrypt.hashSync('admin123', 4)
const TECH_HASH = bcrypt.hashSync('tech123', 4)

/**
 * Build a fully-wired app with isolated temp storage.
 *
 * Creates a fresh temp directory per call and seeds users.json with
 * an `admin` (password: "admin123") and `tech1` (password: "tech123",
 * scoped to tunnel "paris").
 *
 * @param {object} [opts]
 * @param {string} [opts.jwtSecret] override JWT secret (default: test-secret)
 * @param {number} [opts.accessSeconds] access TTL
 * @param {number} [opts.refreshSeconds] refresh TTL
 * @param {object[]} [opts.seedUsers] extra users to seed
 * @returns {Promise<{app: import('fastify').FastifyInstance, tmp: string, login: (username: string, password: string) => Promise<{accessToken: string, refreshToken: string}>}>}
 */
export async function buildTestApp(opts = {}) {
  const tmp = mkdtempSync(join(tmpdir(), 'ostm-int-'))
  mkdirSync(join(tmp, 'tunnels'), { recursive: true })

  const usersFilePath = join(tmp, 'users.json')
  const tunnelsDir = join(tmp, 'tunnels')
  const keysDir = join(tmp, 'keys')
  const logsDir = join(tmp, 'logs')

  mkdirSync(keysDir, { recursive: true })
  mkdirSync(logsDir, { recursive: true })

  // Seed users with pre-computed hashes
  const users = {
    users: [
      { username: 'admin', password_hash: ADMIN_HASH, role: 'admin' },
      { username: 'tech1', password_hash: TECH_HASH, role: 'tech', tunnels: ['paris'] },
      ...(opts.seedUsers || []),
    ],
  }
  writeFileSync(usersFilePath, JSON.stringify(users))

  // Silent logger
  const logger = pino({ level: 'silent' })

  const app = await buildApp({
    logger,
    disableRequestLogging: true,
    jwtSecret: opts.jwtSecret ?? 'test-secret-key',
    accessSeconds: opts.accessSeconds ?? 3600,
    refreshSeconds: opts.refreshSeconds ?? 86400,
    usersFilePath,
    tunnelsDir,
  })

  // Helper to login and obtain tokens
  const login = async (username, password) => {
    const res = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { username, password },
    })
    return res.json()
  }

  return { app, tmp, usersFilePath, tunnelsDir, login }
}

/**
 * Cleanup helper — close app + remove temp dir.
 */
export async function teardownTestApp(app, tmp) {
  if (app?.container?.authService?.close) {
    app.container.authService.close()
  }
  if (app) await app.close()
  if (tmp) {
    const { rmSync } = await import('node:fs')
    rmSync(tmp, { recursive: true, force: true })
  }
}

export default { buildTestApp, teardownTestApp }
