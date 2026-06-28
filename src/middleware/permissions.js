import { ForbiddenError } from '../utils/errors.js'

/**
 * Require one or more roles.
 *
 * Returns a Fastify preHandler that checks `request.user.role`.
 * Admin bypasses all checks.
 *
 * @param {...string} roles
 * @returns {Function} async preHandler
 *
 * @example
 *   { preHandler: [authenticate, requireRole('admin')] }
 */
export function requireRole(...roles) {
  return async function requireRolePreHandler(request, _reply) {
    const user = request.user
    if (!user) throw new ForbiddenError('Authentication required')

    // Admin has access to everything
    if (user.role === 'admin') return

    if (!roles.includes(user.role)) {
      throw new ForbiddenError('Insufficient permissions')
    }
  }
}

/**
 * Require that a tech user has access to a specific tunnel.
 *
 * Checks `request.params.id` (or the configured field) against the user's
 * `tunnels` array. Admin bypasses.
 *
 * @param {object} [opts]
 * @param {string} [opts.field='id'] - which param field contains the tunnel id
 * @returns {Function} async preHandler
 *
 * @example
 *   { preHandler: [authenticate, requireTunnelAccess()] }
 */
export function requireTunnelAccess({ field = 'id' } = {}) {
  return async function requireTunnelAccessHandler(request, _reply) {
    const user = request.user
    if (!user) throw new ForbiddenError('Authentication required')

    // Admin has access to all tunnels
    if (user.role === 'admin') return

    const tunnelId = request.params[field]
    if (!tunnelId) {
      throw new ForbiddenError('Tunnel identifier required')
    }

    const allowedTunnels = user.tunnels || []
    if (!allowedTunnels.includes(tunnelId)) {
      throw new ForbiddenError(`Access denied to tunnel '${tunnelId}'`)
    }
  }
}

export default { requireRole, requireTunnelAccess }
