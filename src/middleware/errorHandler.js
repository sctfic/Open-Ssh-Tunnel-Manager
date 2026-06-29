import { AppError, toErrorPayload } from '../utils/errors.js'

/**
 * Fastify plugin: uniform error + 404 handlers.
 * Response format: { "error": "...", "code": 404 }
 * Fastify/AJV validation failures -> 422.
 */
export function errorHandler(app, _opts, done) {
  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ error: 'Route not found', code: 404 })
  })

  app.setErrorHandler((error, request, reply) => {
    if (error.validation) {
      const msg = error.validation
        .map((v) => v.instancePath || v.schemaPath || v.message)
        .filter(Boolean)
        .join(', ') || 'Validation error'
      request.log?.warn?.({ validation: error.validation }, 'request validation failed')
      return reply.code(422).send({ error: msg, code: 422 })
    }

    if (error instanceof AppError) {
      if (error.statusCode >= 500) {
        request.log?.error?.({ err: error }, error.message)
      } else {
        request.log?.warn?.({ err: error }, error.message)
      }
      return reply.code(error.statusCode).send({ error: error.message, code: error.statusCode })
    }

    request.log?.error?.({ err: error }, 'unhandled error')
    const payload = toErrorPayload(error)
    if (process.env.NODE_ENV === 'development') {
      payload.debug = error.message
    }
    return reply.code(500).send(payload)
  })

  done()
}

errorHandler[Symbol.for('skip-override')] = true

export default errorHandler
