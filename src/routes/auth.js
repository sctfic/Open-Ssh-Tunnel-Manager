import { authenticate } from '../middleware/jwt.js'
import { loginBody, logoutBody, refreshBody } from '../schemas/auth.js'

/**
 * Auth routes plugin.
 *
 *   POST /login           — issue access + refresh tokens
 *   POST /logout          — revoke the current access token
 *   POST /refresh-token   — exchange a refresh token for new tokens
 *
 * Note: response schemas are intentionally omitted (input validation only).
 *
 * @param {import('fastify').FastifyInstance} app
 */
export default async function authRoutes(app) {
  const C = app.container

  app.post('/login', {
    schema: { body: loginBody },
  }, async (request, reply) => {
    const { username, password } = request.body
    const result = await C.authService.login(username, password)
    return reply.code(200).send(result)
  })

  app.post('/logout', {
    preHandler: [authenticate],
    schema: { body: logoutBody },
  }, async (request, reply) => {
    // Revoke both the access token (from header) and the refresh token (from body)
    const authHeader = request.headers.authorization || ''
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

    if (accessToken) {
      await C.authService.logout(accessToken)
    }
    await C.authService.logout(request.body.refreshToken)

    return reply.code(200).send({ success: true })
  })

  app.post('/refresh-token', {
    schema: { body: refreshBody },
  }, async (request, reply) => {
    const { refreshToken } = request.body
    const result = await C.authService.refresh(refreshToken)
    // refresh returns only tokens; fetch user for a complete response
    const payload = await C.authService.verifyToken(result.accessToken)
    const user = await C.userRepository.get(payload.sub)
    return reply.code(200).send({ ...result, user })
  })
}
