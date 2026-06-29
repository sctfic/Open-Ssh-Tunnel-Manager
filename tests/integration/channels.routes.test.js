import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { buildTestApp, teardownTestApp } from '../helpers/appBuilder.js'

const SAMPLE_TUNNEL = {
  id: 'paris',
  user: 'ssh_user',
  ip: '192.168.1.10',
  ssh_port: 22,
  ssh_key: '/path/to/key',
  tunnels: {
    '-L': {},
    '-R': {},
    '-D': {},
  },
}

describe('Channels routes (integration)', () => {
  let env

  beforeEach(async () => {
    env = await buildTestApp()
    // Seed a tunnel for channel tests
    await env.app.inject({
      method: 'POST', url: '/tunnels',
      headers: { authorization: `Bearer ${(await env.login('admin', 'admin123')).accessToken}` },
      payload: SAMPLE_TUNNEL,
    })
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

  // ---- GET /tunnels/:id/channels ----
  describe('GET /tunnels/:id/channels', () => {
    it('returns channels structure (nominal)', async () => {
      const res = await env.app.inject({ method: 'GET', url: '/tunnels/paris/channels', headers: await adminAuth() })
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body).toHaveProperty('-L')
      expect(body).toHaveProperty('-R')
      expect(body).toHaveProperty('-D')
    })

    it('returns 404 for unknown tunnel', async () => {
      const res = await env.app.inject({ method: 'GET', url: '/tunnels/missing/channels', headers: await adminAuth() })
      expect(res.statusCode).toBe(404)
    })

    it('returns 403 for tech not scoped', async () => {
      const res = await env.app.inject({ method: 'GET', url: '/tunnels/london/channels', headers: await techAuth() })
      expect(res.statusCode).toBe(403)
    })
  })

  // ---- POST /tunnels/:id/channels ----
  describe('POST /tunnels/:id/channels', () => {
    it('creates a local forward channel (-L) (nominal)', async () => {
      const res = await env.app.inject({
        method: 'POST', url: '/tunnels/paris/channels', headers: await adminAuth(),
        payload: {
          kind: '-L',
          name: 'printer1',
          listen_port: 9101,
          endpoint_host: 'printer',
          endpoint_port: 9100,
        },
      })
      expect(res.statusCode).toBe(201)
      const body = res.json()
      expect(body.kind).toBe('-L')
      expect(body.name).toBe('printer1')
      expect(body.listen_port).toBe(9101)
    })

    it('creates a remote forward channel (-R)', async () => {
      const res = await env.app.inject({
        method: 'POST', url: '/tunnels/paris/channels', headers: await adminAuth(),
        payload: {
          kind: '-R',
          name: 'camera1',
          listen_port: 5000,
          listen_host: 'camera',
          endpoint_host: '127.0.0.1',
          endpoint_port: 8080,
        },
      })
      expect(res.statusCode).toBe(201)
      expect(res.json().kind).toBe('-R')
    })

    it('creates a dynamic forward channel (-D)', async () => {
      const res = await env.app.inject({
        method: 'POST', url: '/tunnels/paris/channels', headers: await adminAuth(),
        payload: {
          kind: '-D',
          name: 'proxy1',
          listen_port: 4443,
        },
      })
      expect(res.statusCode).toBe(201)
      expect(res.json().kind).toBe('-D')
    })

    it('returns 409 for duplicate channel (same kind + port)', async () => {
      const payload = { kind: '-L', listen_port: 9101, endpoint_host: 'x', endpoint_port: 80 }
      await env.app.inject({ method: 'POST', url: '/tunnels/paris/channels', headers: await adminAuth(), payload })
      const res = await env.app.inject({ method: 'POST', url: '/tunnels/paris/channels', headers: await adminAuth(), payload })
      expect(res.statusCode).toBe(409)
    })

    it('returns 422 for invalid kind', async () => {
      const res = await env.app.inject({
        method: 'POST', url: '/tunnels/paris/channels', headers: await adminAuth(),
        payload: { kind: '-X', listen_port: 8080 },
      })
      expect(res.statusCode).toBe(422)
    })

    it('returns 422 for missing listen_port on -L', async () => {
      const res = await env.app.inject({
        method: 'POST', url: '/tunnels/paris/channels', headers: await adminAuth(),
        payload: { kind: '-L', endpoint_host: 'x', endpoint_port: 80 },
      })
      expect(res.statusCode).toBe(422)
    })

    it('returns 403 for tech role', async () => {
      const res = await env.app.inject({
        method: 'POST', url: '/tunnels/paris/channels', headers: await techAuth(),
        payload: { kind: '-L', listen_port: 9101, endpoint_host: 'x', endpoint_port: 80 },
      })
      expect(res.statusCode).toBe(403)
    })

    it('returns 401 without JWT', async () => {
      const res = await env.app.inject({
        method: 'POST', url: '/tunnels/paris/channels',
        payload: { kind: '-L', listen_port: 9101, endpoint_host: 'x', endpoint_port: 80 },
      })
      expect(res.statusCode).toBe(401)
    })
  })

  // ---- PUT /tunnels/:id/channels/:kind/:port ----
  describe('PUT /tunnels/:id/channels/:kind/:port', () => {
    it('updates a channel (nominal)', async () => {
      // Create first
      await env.app.inject({
        method: 'POST', url: '/tunnels/paris/channels', headers: await adminAuth(),
        payload: { kind: '-L', name: 'printer1', listen_port: 9101, endpoint_host: 'printer', endpoint_port: 9100 },
      })
      // Update
      const res = await env.app.inject({
        method: 'PUT', url: '/tunnels/paris/channels/-L/9101', headers: await adminAuth(),
        payload: { name: 'printer1-renamed', endpoint_port: 9101 },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().name).toBe('printer1-renamed')
      expect(res.json().endpoint_port).toBe(9101)
    })

    it('returns 404 for unknown channel', async () => {
      const res = await env.app.inject({
        method: 'PUT', url: '/tunnels/paris/channels/-L/9999', headers: await adminAuth(),
        payload: { name: 'x' },
      })
      expect(res.statusCode).toBe(404)
    })

    it('returns 422 for invalid kind in params', async () => {
      const res = await env.app.inject({
        method: 'PUT', url: '/tunnels/paris/channels/INVALID/9101', headers: await adminAuth(),
        payload: { name: 'x' },
      })
      expect(res.statusCode).toBe(422)
    })
  })

  // ---- DELETE /tunnels/:id/channels/:kind/:port ----
  describe('DELETE /tunnels/:id/channels/:kind/:port', () => {
    it('deletes a channel (nominal)', async () => {
      await env.app.inject({
        method: 'POST', url: '/tunnels/paris/channels', headers: await adminAuth(),
        payload: { kind: '-L', listen_port: 9101, endpoint_host: 'x', endpoint_port: 80 },
      })
      const res = await env.app.inject({ method: 'DELETE', url: '/tunnels/paris/channels/-L/9101', headers: await adminAuth() })
      expect(res.statusCode).toBe(204)
    })

    it('returns 404 for unknown channel', async () => {
      const res = await env.app.inject({ method: 'DELETE', url: '/tunnels/paris/channels/-L/9999', headers: await adminAuth() })
      expect(res.statusCode).toBe(404)
    })
  })
})
