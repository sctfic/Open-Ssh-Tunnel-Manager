import { ForbiddenError } from '../utils/errors.js'

/**
 * Require one or more roles. Admin bypasses.
 * IMPORTANT: must return an ASYNC function (Fastify v5 requires async
 * preHandlers after an async preHandler, otherwise the request hangs).
 */
export function requireRole(...roles) {
  return async function requireRolePreHandler(request, _reply) {
    const user = request.user
    if (!user) throw new ForbiddenError('Authentication required')
    if (user.role === 'admin') return
    if (!roles.includes(user.role)) {
      throw new ForbiddenError('Insufficient permissions')
    }
  }
}

/**
 * Require that a tech user has access to a specific tunnel.
 * Checks request.params[field] against the user's tunnels array. Admin bypasses.
 */
export function requireTunnelAccess({ field = 'id' } = {}) {
  return async function requireTunnelAccessHandler(request, _reply) {
    const user = request.user
    if (!user) throw new ForbiddenError('Authentication required')
    if (user.role === 'admin') return

    const tunnelId = request.params[field]
    if (!tunnelId) throw new ForbiddenError('Tunnel identifier required')

    const allowedTunnels = user.tunnels || []
    if (!allowedTunnels.includes(tunnelId)) {
      throw new ForbiddenError(`Access denied to tunnel '${tunnelId}'`)
    }
  }
}

export default { requireRole, requireTunnelAccess }
