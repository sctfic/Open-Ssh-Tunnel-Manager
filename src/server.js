/**
 * OSTM — Open SSH Tunnel Manager
 *
 * Entry point: loads .env, validates config, builds the Fastify app and
 * starts listening. Graceful shutdown handles SIGINT/SIGTERM.
 */
import { validateConfig } from './config.js'
import { createLogger } from './logger.js'
import { buildApp } from './app.js'

async function main() {
  // Validate configuration early (fail fast on missing JWT_SECRET, etc.)
  validateConfig()

  const logger = createLogger()
  logger.info('OSTM starting…')

  const app = await buildApp({ logger })

  const port = process.env.PORT ?? 8080
  const host = process.env.HOST ?? '0.0.0.0'

  try {
    const address = await app.listen({ port, host })
    logger.info({ address }, 'Server listening')
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server')
    process.exit(1)
  }

  // Graceful shutdown
  const shutdown = async (signal) => {
    logger.info({ signal }, 'Shutdown initiated')
    try {
      await app.close()
      logger.info('Server stopped')
    } catch (err) {
      logger.error({ err }, 'Error during shutdown')
      process.exit(1)
    }
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main()
