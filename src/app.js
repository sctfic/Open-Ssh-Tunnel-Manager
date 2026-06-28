/**
 * Fastify application factory.
 *
 * This module builds and returns a fully-configured Fastify app **without**
 * calling `listen()`. This makes it testable via supertest.
 *
 * In production, `server.js` imports this and calls `app.listen()`.
 */
import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import ajvFormats from 'ajv-formats'
import { createLogger } from './logger.js'
import { errorHandler } from './middleware/errorHandler.js'
import { container } from './container.js'
import authRoutes from './routes/auth.js'
import userRoutes from './routes/users.js'
import tunnelRoutes from './routes/tunnels.js'
import channelRoutes from './routes/channels.js'

/**
 * @param {object} [opts] — overrides injected for tests
 * @param {object} [opts.logger] — custom pino instance (silence in tests)
 * @param {string} [opts.jwtSecret] — override JWT secret
 * @returns {Promise<import('fastify').FastifyInstance>}
 */
export async function buildApp(opts = {}) {
  const log = opts.logger ?? createLogger()

  const app = Fastify({
    // Fastify accepts a logger *config* object, not a live pino instance.
    logger: false,
    requestIdLogLabel: 'requestId',
    requestIdHeader: 'x-request-id',
    disableRequestLogging: opts.disableRequestLogging ?? false,
    // Use Fastify's built-in AJV8 with formats (email, uri, date-time, ...).
    // Configured here (not via setValidatorCompiler) so it propagates correctly
    // to encapsulated plugin contexts created by app.register().
    ajv: {
      customOptions: {
        allErrors: true,
        removeAdditional: false,
        strict: true,
      },
      plugins: [
        [ajvFormats, []],
      ],
    },
  })

  // --- Plugins (no prefix) ---
  await app.register(websocket)

  // --- Error handling (must be registered after validation compiler) ---
  await app.register(errorHandler)

  // --- DI container (services, repositories, etc.) ---
  const c = container(opts)

  // Expose container for route access — MUST be before route registrations
  // because Fastify's register() creates an encapsulated context.
  app.decorate('container', c)

  // --- Health check (no auth required) ---
  app.get('/health', async (_request, reply) => {
    return reply.code(200).send({ status: 'ok', timestamp: Date.now() })
  })

  // --- Routes ---

  // Auth routes (no prefix)
  await app.register(authRoutes)

  // User routes
  await app.register(userRoutes)

  // Tunnel routes
  await app.register(tunnelRoutes, { prefix: '/tunnels' })

  // Channel routes (sub-resource of tunnels)
  await app.register(channelRoutes, { prefix: '/tunnels/:id/channels' })

  // TODO: Step 6 — Stats routes + WS
  // await app.register(statsRoutes)

  // TODO: Step 7 — Pairing route
  // await app.register(pairingRoutes)

  return app
}

export default buildApp
