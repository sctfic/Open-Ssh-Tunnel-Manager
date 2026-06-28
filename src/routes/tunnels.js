import { authenticate } from '../middleware/jwt.js'
import { requireRole, requireTunnelAccess } from '../middleware/permissions.js'
import {
  tunnelIdParam,
  createTunnelBody,
  updateTunnelBody,
} from '../schemas/tunnels.js'

/**
 * Tunnel routes plugin.
 *
 *   GET    /tunnels           — list tunnels (admin=all, tech=filtered)
 *   GET    /tunnels/:id       — get tunnel config
 *   POST   /tunnels           — create tunnel (admin only)
 *   PUT    /tunnels/:id       — update tunnel (admin only)
 *   DELETE /tunnels/:id       — delete tunnel (admin only)
 *   POST   /tunnels/:id/start   — start tunnel (admin or scoped tech)
 *   POST   /tunnels/:id/stop    — stop tunnel (admin or scoped tech)
 *   POST   /tunnels/:id/restart — restart tunnel (admin or scoped tech)
 *
 * @param {import('fastify').FastifyInstance} app
 */
export default async function tunnelRoutes(app) {
  const C = app.container

  // ---- List ----
  app.get('/', {
    preHandler: [authenticate],
  }, async (request, reply) => {
    const tunnels = await C.tunnelManager.list(request.user)
    return reply.code(200).send(tunnels)
  })

  // ---- Get one ----
  app.get('/:id', {
    preHandler: [authenticate, requireTunnelAccess()],
    schema: { params: tunnelIdParam },
  }, async (request, reply) => {
    const tunnel = await C.tunnelManager.get(request.params.id)
    return reply.code(200).send(tunnel)
  })

  // ---- Create ----
  app.post('/', {
    preHandler: [authenticate, requireRole('admin')],
    schema: { body: createTunnelBody },
  }, async (request, reply) => {
    const tunnel = await C.tunnelManager.create(request.body)
    return reply.code(201).send(tunnel)
  })

  // ---- Update ----
  app.put('/:id', {
    preHandler: [authenticate, requireRole('admin')],
    schema: { params: tunnelIdParam, body: updateTunnelBody },
  }, async (request, reply) => {
    const tunnel = await C.tunnelManager.update(request.params.id, request.body)
    return reply.code(200).send(tunnel)
  })

  // ---- Delete ----
  app.delete('/:id', {
    preHandler: [authenticate, requireRole('admin')],
    schema: { params: tunnelIdParam },
  }, async (request, reply) => {
    await C.tunnelManager.remove(request.params.id)
    return reply.code(204).send()
  })

  // ---- Lifecycle ----
  app.post('/:id/start', {
    preHandler: [authenticate, requireTunnelAccess()],
    schema: { params: tunnelIdParam },
  }, async (request, reply) => {
    const result = await C.tunnelManager.start(request.params.id)
    return reply.code(200).send(result)
  })

  app.post('/:id/stop', {
    preHandler: [authenticate, requireTunnelAccess()],
    schema: { params: tunnelIdParam },
  }, async (request, reply) => {
    const result = await C.tunnelManager.stop(request.params.id)
    return reply.code(200).send(result)
  })

  app.post('/:id/restart', {
    preHandler: [authenticate, requireTunnelAccess()],
    schema: { params: tunnelIdParam },
  }, async (request, reply) => {
    const result = await C.tunnelManager.restart(request.params.id)
    return reply.code(200).send(result)
  })
}
