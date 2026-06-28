import { authenticate } from '../middleware/jwt.js'
import { requireRole, requireTunnelAccess } from '../middleware/permissions.js'
import { tunnelIdParam } from '../schemas/tunnels.js'
import {
  channelKindParam,
  createChannelBody,
  updateChannelBody,
} from '../schemas/channels.js'

/**
 * Channel routes plugin (sub-resource of tunnels).
 *
 * Channels are keyed by their kind (-L/-R/-D) + listen_port (as string).
 *
 *   GET    /tunnels/:id/channels              — list all channels
 *   POST   /tunnels/:id/channels              — add a channel
 *   PUT    /tunnels/:id/channels/:kind/:port  — update a channel
 *   DELETE /tunnels/:id/channels/:kind/:port  — remove a channel
 *
 * @param {import('fastify').FastifyInstance} app
 */
export default async function channelRoutes(app) {
  const C = app.container

  // ---- List channels ----
  app.get('/', {
    preHandler: [authenticate, requireTunnelAccess()],
    schema: { params: tunnelIdParam },
  }, async (request, reply) => {
    const channels = await C.tunnelManager.listChannels(request.params.id)
    return reply.code(200).send(channels)
  })

  // ---- Create channel ----
  app.post('/', {
    preHandler: [authenticate, requireRole('admin')],
    schema: {
      params: tunnelIdParam,
      body: createChannelBody,
    },
  }, async (request, reply) => {
    const channel = await C.tunnelManager.createChannel(
      request.params.id,
      request.body,
    )
    return reply.code(201).send(channel)
  })

  // ---- Update channel ----
  app.put('/:kind/:port', {
    preHandler: [authenticate, requireRole('admin')],
    schema: {
      params: channelKindParam,
      body: updateChannelBody,
    },
  }, async (request, reply) => {
    const { id, kind, port } = request.params
    const channel = await C.tunnelManager.updateChannel(id, kind, port, request.body)
    return reply.code(200).send(channel)
  })

  // ---- Delete channel ----
  app.delete('/:kind/:port', {
    preHandler: [authenticate, requireRole('admin')],
    schema: {
      params: channelKindParam,
    },
  }, async (request, reply) => {
    const { id, kind, port } = request.params
    await C.tunnelManager.removeChannel(id, kind, port)
    return reply.code(204).send()
  })
}
