import bcrypt from 'bcrypt'
import { authenticate } from '../middleware/jwt.js'
import { requireRole } from '../middleware/permissions.js'
import { usernameParam, createUserBody, updateUserBody } from '../schemas/users.js'

/**
 * User management routes (admin only).
 *   GET POST /users
 *   GET PUT DELETE /users/:username
 */
export default async function userRoutes(app) {
  const C = app.container

  app.get('/users', {
    preHandler: [authenticate, requireRole('admin')],
  }, async (_request, reply) => {
    const users = await C.userRepository.list()
    return reply.code(200).send(users)
  })

  app.get('/users/:username', {
    preHandler: [authenticate, requireRole('admin')],
    schema: { params: usernameParam },
  }, async (request, reply) => {
    const user = await C.userRepository.get(request.params.username)
    return reply.code(200).send(user)
  })

  app.post('/users', {
    preHandler: [authenticate, requireRole('admin')],
    schema: { body: createUserBody },
  }, async (request, reply) => {
    const { username, password, role, tunnels } = request.body
    const password_hash = await bcrypt.hash(password, 10)
    const created = await C.userRepository.create({
      username, password_hash, role, tunnels: tunnels || [],
    })
    return reply.code(201).send(created)
  })

  app.put('/users/:username', {
    preHandler: [authenticate, requireRole('admin')],
    schema: { params: usernameParam, body: updateUserBody },
  }, async (request, reply) => {
    const patch = { ...request.body }
    if (patch.password) {
      patch.password_hash = await bcrypt.hash(patch.password, 10)
      delete patch.password
    }
    const updated = await C.userRepository.update(request.params.username, patch)
    return reply.code(200).send(updated)
  })

  app.delete('/users/:username', {
    preHandler: [authenticate, requireRole('admin')],
    schema: { params: usernameParam },
  }, async (request, reply) => {
    await C.userRepository.remove(request.params.username)
    return reply.code(204).send()
  })
}
