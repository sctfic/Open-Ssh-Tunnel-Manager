import { UnauthorizedError } from '../utils/errors.js'

/**
 * JWT authentication middleware (Fastify preHandler).
 *
 * Reads the Authorization header ("Bearer <token>"), verifies it via the
 * AuthService, and attaches the decoded payload to `request.user`.
 *
 * Usage:
 *   { preHandler: [authenticate] }
 */
export async function authenticate(request, _reply) {
  const auth = request.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid Authorization header')
  }

  const token = auth.slice(7) // strip "Bearer "
  if (!token) {
    throw new UnauthorizedError('Missing token')
  }

  // The AuthService is expected to be available on the Fastify instance
  // via DI container (app.container.authService).
  const authService = request.server.container?.authService
  if (!authService) {
    throw new Error('AuthService not available in container')
  }

  try {
    const payload = await authService.verifyToken(token)
    request.user = payload
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err
    throw new UnauthorizedError('Invalid or expired token')
  }
}

export default authenticate
