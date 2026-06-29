import { UnauthorizedError } from '../utils/errors.js'

/**
 * JWT authentication preHandler (Fastify).
 * Reads "Authorization: Bearer <token>", verifies it, attaches to request.user.
 */
export async function authenticate(request, _reply) {
  const auth = request.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid Authorization header')
  }

  const token = auth.slice(7)
  if (!token) throw new UnauthorizedError('Missing token')

  const authService = request.server.container?.authService
  if (!authService) throw new Error('AuthService not available in container')

  try {
    const payload = await authService.verifyToken(token)
    request.user = payload
  } catch (err) {
    if (err instanceof UnauthorizedError) throw err
    throw new UnauthorizedError('Invalid or expired token')
  }
}

export default authenticate
