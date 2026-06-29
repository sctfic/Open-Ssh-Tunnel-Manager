import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { buildTestApp, teardownTestApp } from '../helpers/appBuilder.js'

describe('Users routes (integration)', () => {
  let env

  beforeEach(async () => {
    env = await buildTestApp()
  })
  afterEach(async () => {
    await teardownTestApp(env.app, env.tmp)
    env = null
  })

  async function adminAuth() {
    const { accessToken } = await env.login('admin', 'admin123')
    return { authorization: `Bearer ${accessToken}` }
  }

  async function techAuth() {
    const { accessToken } = await env.login('tech1', 'tech123')
    return { authorization: `Bearer ${accessToken}` }
  }

  describe('GET /users', () => {
    it('returns all users for admin (nominal)', async () => {
      const res = await env.app.inject({
        method: 'GET',
        url: '/users',
        headers: await adminAuth(),
      })
      expect(res.statusCode).toBe(200)
      const users = res.json()
      expect(Array.isArray(users)).toBe(true)
      expect(users.length).toBeGreaterThanOrEqual(2)
      expect(users[0]).not.toHaveProperty('password_hash')
    })

    it('returns 401 without JWT', async () => {
      const res = await env.app.inject({ method: 'GET', url: '/users' })
      expect(res.statusCode).toBe(401)
    })

    it('returns 401 with invalid JWT', async () => {
      const res = await env.app.inject({
        method: 'GET',
        url: '/users',
        headers: { authorization: 'Bearer invalid' },
      })
      expect(res.statusCode).toBe(401)
    })

    it('returns 403 for tech role (permissions)', async () => {
      const res = await env.app.inject({
        method: 'GET',
        url: '/users',
        headers: await techAuth(),
      })
      expect(res.statusCode).toBe(403)
    })
  })

  describe('GET /users/:username', () => {
    it('returns a single user for admin (nominal)', async () => {
      const res = await env.app.inject({
        method: 'GET',
        url: '/users/admin',
        headers: await adminAuth(),
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().username).toBe('admin')
    })

    it('returns 404 for unknown user', async () => {
      const res = await env.app.inject({
        method: 'GET',
        url: '/users/nobody',
        headers: await adminAuth(),
      })
      expect(res.statusCode).toBe(404)
    })

    it('returns 403 for tech role', async () => {
      const res = await env.app.inject({
        method: 'GET',
        url: '/users/admin',
        headers: await techAuth(),
      })
      expect(res.statusCode).toBe(403)
    })
  })

  describe('POST /users', () => {
    it('creates a user for admin (nominal)', async () => {
      const res = await env.app.inject({
        method: 'POST',
        url: '/users',
        headers: await adminAuth(),
        payload: { username: 'newuser', password: 'pass1234', role: 'tech', tunnels: ['paris'] },
      })
      expect(res.statusCode).toBe(201)
      const body = res.json()
      expect(body.username).toBe('newuser')
      expect(body.role).toBe('tech')
      expect(body.tunnels).toEqual(['paris'])
      expect(body).not.toHaveProperty('password_hash')
    })

    it('returns 409 for duplicate username', async () => {
      const res = await env.app.inject({
        method: 'POST',
        url: '/users',
        headers: await adminAuth(),
        payload: { username: 'admin', password: 'pass1234', role: 'tech' },
      })
      expect(res.statusCode).toBe(409)
    })

    it('returns 422 for invalid body (missing role)', async () => {
      const res = await env.app.inject({
        method: 'POST',
        url: '/users',
        headers: await adminAuth(),
        payload: { username: 'x', password: 'pass1234' },
      })
      expect(res.statusCode).toBe(422)
    })

    it('returns 422 for invalid role value', async () => {
      const res = await env.app.inject({
        method: 'POST',
        url: '/users',
        headers: await adminAuth(),
        payload: { username: 'x', password: 'pass1234', role: 'superuser' },
      })
      expect(res.statusCode).toBe(422)
    })

    it('returns 403 for tech role', async () => {
      const res = await env.app.inject({
        method: 'POST',
        url: '/users',
        headers: await techAuth(),
        payload: { username: 'x', password: 'pass1234', role: 'tech' },
      })
      expect(res.statusCode).toBe(403)
    })

    it('returns 401 without JWT', async () => {
      const res = await env.app.inject({
        method: 'POST',
        url: '/users',
        payload: { username: 'x', password: 'pass1234', role: 'tech' },
      })
      expect(res.statusCode).toBe(401)
    })
  })

  describe('PUT /users/:username', () => {
    it('updates a user for admin (nominal)', async () => {
      const res = await env.app.inject({
        method: 'PUT',
        url: '/users/tech1',
        headers: await adminAuth(),
        payload: { role: 'admin' },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().role).toBe('admin')
    })

    it('updates password (nominal)', async () => {
      const res = await env.app.inject({
        method: 'PUT',
        url: '/users/tech1',
        headers: await adminAuth(),
        payload: { password: 'newpass123' },
      })
      expect(res.statusCode).toBe(200)

      // Should be able to login with new password
      const loginRes = await env.app.inject({
        method: 'POST',
        url: '/login',
        payload: { username: 'tech1', password: 'newpass123' },
      })
      expect(loginRes.statusCode).toBe(200)
    })

    it('returns 404 for unknown user', async () => {
      const res = await env.app.inject({
        method: 'PUT',
        url: '/users/nobody',
        headers: await adminAuth(),
        payload: { role: 'tech' },
      })
      expect(res.statusCode).toBe(404)
    })

    it('returns 422 for invalid role', async () => {
      const res = await env.app.inject({
        method: 'PUT',
        url: '/users/tech1',
        headers: await adminAuth(),
        payload: { role: 'invalid' },
      })
      expect(res.statusCode).toBe(422)
    })

    it('returns 403 for tech role', async () => {
      const res = await env.app.inject({
        method: 'PUT',
        url: '/users/tech1',
        headers: await techAuth(),
        payload: { role: 'admin' },
      })
      expect(res.statusCode).toBe(403)
    })
  })

  describe('DELETE /users/:username', () => {
    it('deletes a user for admin (nominal)', async () => {
      const res = await env.app.inject({
        method: 'DELETE',
        url: '/users/tech1',
        headers: await adminAuth(),
      })
      expect(res.statusCode).toBe(204)

      // Confirm deletion
      const getRes = await env.app.inject({
        method: 'GET',
        url: '/users/tech1',
        headers: await adminAuth(),
      })
      expect(getRes.statusCode).toBe(404)
    })

    it('returns 404 for unknown user', async () => {
      const res = await env.app.inject({
        method: 'DELETE',
        url: '/users/nobody',
        headers: await adminAuth(),
      })
      expect(res.statusCode).toBe(404)
    })

    it('returns 403 for tech role', async () => {
      const res = await env.app.inject({
        method: 'DELETE',
        url: '/users/admin',
        headers: await techAuth(),
      })
      expect(res.statusCode).toBe(403)
    })
  })
})
