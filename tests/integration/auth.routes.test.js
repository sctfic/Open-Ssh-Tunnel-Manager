import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { buildTestApp, teardownTestApp } from '../helpers/appBuilder.js'

describe('Auth routes (integration)', () => {
  let env

  beforeEach(async () => {
    env = await buildTestApp()
  })
  afterEach(async () => {
    await teardownTestApp(env.app, env.tmp)
    env = null
  })

  describe('POST /login', () => {
    it('returns tokens for valid credentials (nominal)', async () => {
      const res = await env.app.inject({
        method: 'POST',
        url: '/login',
        payload: { username: 'admin', password: 'admin123' },
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.accessToken).toBeTypeOf('string')
      expect(body.refreshToken).toBeTypeOf('string')
      expect(body.user.username).toBe('admin')
      expect(body.user.role).toBe('admin')
      expect(body.user).not.toHaveProperty('password_hash')
    })

    it('returns 401 for unknown user', async () => {
      const res = await env.app.inject({
        method: 'POST',
        url: '/login',
        payload: { username: 'ghost', password: 'whatever' },
      })
      expect(res.statusCode).toBe(401)
      expect(res.json().code).toBe(401)
    })

    it('returns 401 for wrong password', async () => {
      const res = await env.app.inject({
        method: 'POST',
        url: '/login',
        payload: { username: 'admin', password: 'wrong' },
      })
      expect(res.statusCode).toBe(401)
    })

    it('returns 422 for invalid body (missing password)', async () => {
      const res = await env.app.inject({
        method: 'POST',
        url: '/login',
        payload: { username: 'admin' },
      })
      expect(res.statusCode).toBe(422)
    })

    it('returns 422 for empty body', async () => {
      const res = await env.app.inject({
        method: 'POST',
        url: '/login',
        payload: {},
      })
      expect(res.statusCode).toBe(422)
    })
  })

  describe('POST /refresh-token', () => {
    it('issues new tokens for a valid refresh token (nominal)', async () => {
      const { refreshToken } = await env.login('admin', 'admin123')
      const res = await env.app.inject({
        method: 'POST',
        url: '/refresh-token',
        payload: { refreshToken },
      })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.accessToken).toBeTypeOf('string')
      expect(body.refreshToken).toBeTypeOf('string')
      expect(body.user.username).toBe('admin')
    })

    it('returns 401 for invalid refresh token', async () => {
      const res = await env.app.inject({
        method: 'POST',
        url: '/refresh-token',
        payload: { refreshToken: 'garbage.token.here' },
      })
      expect(res.statusCode).toBe(401)
    })

    it('returns 422 when refreshToken missing', async () => {
      const res = await env.app.inject({
        method: 'POST',
        url: '/refresh-token',
        payload: {},
      })
      expect(res.statusCode).toBe(422)
    })

    it('blacklists the old refresh token after rotation', async () => {
      const { refreshToken } = await env.login('admin', 'admin123')

      // First refresh succeeds
      const res1 = await env.app.inject({
        method: 'POST',
        url: '/refresh-token',
        payload: { refreshToken },
      })
      expect(res1.statusCode).toBe(200)

      // Reusing the same refresh token should now fail (rotation)
      const res2 = await env.app.inject({
        method: 'POST',
        url: '/refresh-token',
        payload: { refreshToken },
      })
      expect(res2.statusCode).toBe(401)
    })
  })

  describe('POST /logout', () => {
    it('returns 401 without JWT', async () => {
      const res = await env.app.inject({
        method: 'POST',
        url: '/logout',
        payload: { refreshToken: 'x' },
      })
      expect(res.statusCode).toBe(401)
    })

    it('revokes the access token (nominal)', async () => {
      const { accessToken, refreshToken } = await env.login('admin', 'admin123')

      const res = await env.app.inject({
        method: 'POST',
        url: '/logout',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { refreshToken },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().success).toBe(true)

      // The access token should now be unusable
      const res2 = await env.app.inject({
        method: 'GET',
        url: '/users',
        headers: { authorization: `Bearer ${accessToken}` },
      })
      expect(res2.statusCode).toBe(401)
    })

    it('returns 401 with invalid JWT', async () => {
      const res = await env.app.inject({
        method: 'POST',
        url: '/logout',
        headers: { authorization: 'Bearer invalid.token.here' },
        payload: { refreshToken: 'x' },
      })
      expect(res.statusCode).toBe(401)
    })
  })

  describe('General auth protection', () => {
    it('returns 401 on protected route without JWT', async () => {
      const res = await env.app.inject({ method: 'GET', url: '/users' })
      expect(res.statusCode).toBe(401)
    })

    it('returns 401 on protected route with invalid JWT', async () => {
      const res = await env.app.inject({
        method: 'GET',
        url: '/users',
        headers: { authorization: 'Bearer not-a-jwt' },
      })
      expect(res.statusCode).toBe(401)
    })
  })
})
