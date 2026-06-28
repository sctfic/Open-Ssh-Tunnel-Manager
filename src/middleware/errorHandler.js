import { fileURLToPath } from 'node:url'
import { AppError, ValidationError, toErrorPayload } from '../utils/errors.js'

const __filename = fileURLToPath(import.meta.url)

/**
 * Fastify plugin: installs a uniform error handler and a 404 handler.
 *
 * Response format on error (per the spec):
 *   { "error": "Tunnel not found", "code": 404 }
 *
 * Fastify validation failures (AJV) are converted to 422.
 */
export function errorHandler(app, _opts, done) {
  // 404 — route not found
  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({ error: 'Route not found', code: 404 })
  })

  // Global error handler
  app.setErrorHandler((error, request, reply) => {
    // Fastify/AJV validation error -> 422
    if (error.validation) {
      const msg = error.validation
        .map((v) => v.instancePath || v.schemaPath || '')
        .concat(error.validation.map((v) => v.message))
        .filter(Boolean)
        .join(', ') || 'Validation error'
      request.log?.warn?.({ validation: error.validation }, 'request validation failed')
      return reply.code(422).send({ error: msg, code: 422 })
    }

    // Known AppError -> use its statusCode/code
    if (error instanceof AppError) {
      if (error.statusCode >= 500) {
        request.log?.error?.({ err: error }, error.message)
      } else {
        request.log?.warn?.({ err: error }, error.message)
      }
      return reply.code(error.statusCode).send({ error: error.message, code: error.statusCode })
    }

    // Unknown error -> 500, do not leak internals (but include details in dev)
    request.log?.error?.({ err: error }, 'unhandled error')
    const payload = toErrorPayload(error)
    if (process.env.NODE_ENV === 'development') {
      payload.debug = error.message
      payload.stack = error.stack
    }
    return reply.code(500).send(payload)
  })

  done()
}

errorHandler[Symbol.for('skip-override')] = true

export default errorHandler
// Re-export so tests can import without extension ambiguity.
export { __filename }
export { ValidationError }
