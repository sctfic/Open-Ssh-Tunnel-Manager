/**
 * Lightweight dependency injection container.
 *
 * All services and repositories are instantiated here with their
 * dependencies explicitly wired. In tests, overrides can be passed
 * to swap real implementations with mocks/stubs.
 */
import { resolve } from 'node:path'
import { config } from './config.js'
import { createLogger } from './logger.js'
import { UserRepository } from './repositories/UserRepository.js'
import { TunnelRepository } from './repositories/TunnelRepository.js'
import { AuthService } from './services/AuthService.js'
import { TunnelManager } from './services/TunnelManager.js'

/**
 * Build the DI container.
 *
 * @param {object} [overrides] — optional mock overrides for tests
 * @returns {object} container with all services/repositories
 */
export function container(overrides = {}) {
  const log = overrides.logger ?? createLogger()

  // --- Repositories ---
  const userRepository =
    overrides.userRepository ??
    new UserRepository({
      filePath: overrides.usersFilePath ?? resolve(config.paths.dataDir, 'users.json'),
    })

  const tunnelRepository =
    overrides.tunnelRepository ??
    new TunnelRepository({
      dir: overrides.tunnelsDir ?? resolve(config.paths.dataDir, 'tunnels'),
    })

  // --- Auth service ---
  const authService =
    overrides.authService ??
    new AuthService({
      userRepository,
      jwtSecret: overrides.jwtSecret ?? config.jwt.secret,
      accessSeconds: overrides.accessSeconds ?? config.jwt.accessSeconds,
      refreshSeconds: overrides.refreshSeconds ?? config.jwt.refreshSeconds,
    })

  // --- Tunnel manager ---
  const tunnelManager =
    overrides.tunnelManager ??
    new TunnelManager({
      tunnelRepository,
      logger: log,
    })

  return Object.freeze({
    config,
    logger: log,

    // repositories
    userRepository,
    tunnelRepository,

    // services
    authService,
    tunnelManager,

    // services to come
    // statsCollector, pairingService
  })
}

export default container
