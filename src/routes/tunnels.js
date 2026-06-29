import { authenticate } from '../middleware/jwt.js'
import { requireRole, requireTunnelAccess } from '../middleware/permissions.js'
import { tunnelIdParam, createTunnelBody, updateTunnelBody } from '../schemas/tunnels.js'

/**
 * Tunnel routes (mounted at /tunnels).
 *   GET    /                  — list (admin=all, tech=filtered)
 *   GET    /:id               — get one
 *   POST   /                  — create (admin)
 *   PUT    /:id               — update (admin)
 *   DELETE /:id               — delete (admin)
 *   POST   /:id/start|stop|restart
 */
export default async function tunnelRoutes(app) {
  const C = app.container

  app.get('/', { preHandler: [authenticate] }, async (request, reply) => {
    const tunnels = await C.tunnelManager.list(request.user)
    return reply.code(200).send(tunnels)
  })

  app.get('/:id', {
    preHandler: [authenticate, requireTunnelAccess()],
    schema: { params: tunnelIdParam },
  }, async (request, reply) => {
    const tunnel = await C.tunnelManager.get(request.params.id)
    return reply.code(200).send(tunnel)
  })

  app.post('/', {
    preHandler: [authenticate, requireRole('admin')],
    schema: { body: createTunnelBody },
  }, async (request, reply) => {
    const tunnel = await C.tunnelManager.create(request.body)
    return reply.code(201).send(tunnel)
  })

  app.put('/:id', {
    preHandler: [authenticate, requireRole('admin')],
    schema: { params: tunnelIdParam, body: updateTunnelBody },
  }, async (request, reply) => {
    const tunnel = await C.tunnelManager.update(request.params.id, request.body)
    return reply.code(200).send(tunnel)
  })

  app.delete('/:id', {
    preHandler: [authenticate, requireRole('admin')],
    schema: { params: tunnelIdParam },
  }, async (request, reply) => {
    await C.tunnelManager.remove(request.params.id)
    return reply.code(204).send()
  })

  app.post('/:id/start', {
    preHandler: [authenticate, requireTunnelAccess()],
    schema: { params: tunnelIdParam },
  }, async (request, reply) => {
    return reply.code(200).send(await C.tunnelManager.start(request.params.id))
  })

  app.post('/:id/stop', {
    preHandler: [authenticate, requireTunnelAccess()],
    schema: { params: tunnelIdParam },
  }, async (request, reply) => {
    return reply.code(200).send(await C.tunnelManager.stop(request.params.id))
  })

  app.post('/:id/restart', {
    preHandler: [authenticate, requireTunnelAccess()],
    schema: { params: tunnelIdParam },
  }, async (request, reply) => {
    return reply.code(200).send(await C.tunnelManager.restart(request.params.id))
  })
}
