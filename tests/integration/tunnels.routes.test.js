import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { buildTestApp, teardownTestApp } from '../helpers/appBuilder.js'

const SAMPLE_TUNNEL = {
  id: 'paris',
  user: 'ssh_user',
  ip: '192.168.1.10',
  ssh_port: 22,
  ssh_key: '/path/to/key',
  options: { compression: 'yes', ServerAliveInterval: 10 },
  bandwidth: { up: 132, down: 96 },
  tunnels: {
    '-L': {
      '9101': { name: 'printer1', listen_port: 9101, endpoint_host: 'printer', endpoint_port: 9100 },
    },
  },
}

describe('Tunnels routes (integration)', () => {
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

  // ---- POST /tunnels (create) ----
  describe('POST /tunnels', () => {
    it('creates a tunnel for admin (nominal)', async () => {
      const res = await env.app.inject({
        method: 'POST',
        url: '/tunnels',
        headers: await adminAuth(),
        payload: SAMPLE_TUNNEL,
      })
      expect(res.statusCode).toBe(201)
      const body = res.json()
      expect(body.id).toBe('paris')
      expect(body.user).toBe('ssh_user')
      expect(body.tunnels['-L']['9101'].name).toBe('printer1')
    })

    it('returns 409 for duplicate tunnel id', async () => {
      await env.app.inject({ method: 'POST', url: '/tunnels', headers: await adminAuth(), payload: SAMPLE_TUNNEL })
      const res = await env.app.inject({ method: 'POST', url: '/tunnels', headers: await adminAuth(), payload: SAMPLE_TUNNEL })
      expect(res.statusCode).toBe(409)
    })

    it('returns 422 for invalid body (missing required fields)', async () => {
      const res = await env.app.inject({
        method: 'POST', url: '/tunnels', headers: await adminAuth(),
        payload: { id: 'test' }, // missing user, ip, ssh_port, ssh_key
      })
      expect(res.statusCode).toBe(422)
    })

    it('returns 422 for invalid id (special chars)', async () => {
      const res = await env.app.inject({
        method: 'POST', url: '/tunnels', headers: await adminAuth(),
        payload: { ...SAMPLE_TUNNEL, id: 'invalid!' },
      })
      expect(res.statusCode).toBe(422)
    })

    it('returns 401 without JWT', async () => {
      const res = await env.app.inject({ method: 'POST', url: '/tunnels', payload: SAMPLE_TUNNEL })
      expect(res.statusCode).toBe(401)
    })

    it('returns 403 for tech role', async () => {
      const res = await env.app.inject({
        method: 'POST', url: '/tunnels', headers: await techAuth(), payload: SAMPLE_TUNNEL,
      })
      expect(res.statusCode).toBe(403)
    })
  })

  // ---- GET /tunnels (list) ----
  describe('GET /tunnels', () => {
    it('returns empty list initially', async () => {
      const res = await env.app.inject({ method: 'GET', url: '/tunnels', headers: await adminAuth() })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual([])
    })

    it('returns tunnels after creation', async () => {
      await env.app.inject({ method: 'POST', url: '/tunnels', headers: await adminAuth(), payload: SAMPLE_TUNNEL })
      const res = await env.app.inject({ method: 'GET', url: '/tunnels', headers: await adminAuth() })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toHaveLength(1)
      expect(res.json()[0].id).toBe('paris')
    })

    it('filters tunnels for tech user (only scoped)', async () => {
      await env.app.inject({ method: 'POST', url: '/tunnels', headers: await adminAuth(), payload: SAMPLE_TUNNEL })
      // tech1 is scoped to 'paris'
      const res = await env.app.inject({ method: 'GET', url: '/tunnels', headers: await techAuth() })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toHaveLength(1)
      expect(res.json()[0].id).toBe('paris')
    })

    it('tech sees nothing if no scoped tunnels exist', async () => {
      await env.app.inject({
        method: 'POST', url: '/tunnels', headers: await adminAuth(),
        payload: { ...SAMPLE_TUNNEL, id: 'london' },
      })
      const res = await env.app.inject({ method: 'GET', url: '/tunnels', headers: await techAuth() })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual([])
    })

    it('returns 401 without JWT', async () => {
      const res = await env.app.inject({ method: 'GET', url: '/tunnels' })
      expect(res.statusCode).toBe(401)
    })
  })

  // ---- GET /tunnels/:id ----
  describe('GET /tunnels/:id', () => {
    it('returns a tunnel by id (nominal)', async () => {
      await env.app.inject({ method: 'POST', url: '/tunnels', headers: await adminAuth(), payload: SAMPLE_TUNNEL })
      const res = await env.app.inject({ method: 'GET', url: '/tunnels/paris', headers: await adminAuth() })
      expect(res.statusCode).toBe(200)
      expect(res.json().id).toBe('paris')
      expect(res.json().bandwidth).toEqual({ up: 132, down: 96 })
    })

    it('returns 404 for unknown tunnel', async () => {
      const res = await env.app.inject({ method: 'GET', url: '/tunnels/missing', headers: await adminAuth() })
      expect(res.statusCode).toBe(404)
    })

    it('returns 403 for tech user not scoped to tunnel', async () => {
      await env.app.inject({
        method: 'POST', url: '/tunnels', headers: await adminAuth(),
        payload: { ...SAMPLE_TUNNEL, id: 'london' },
      })
      const res = await env.app.inject({ method: 'GET', url: '/tunnels/london', headers: await techAuth() })
      expect(res.statusCode).toBe(403)
    })

    it('tech can access scoped tunnel', async () => {
      await env.app.inject({ method: 'POST', url: '/tunnels', headers: await adminAuth(), payload: SAMPLE_TUNNEL })
      const res = await env.app.inject({ method: 'GET', url: '/tunnels/paris', headers: await techAuth() })
      expect(res.statusCode).toBe(200)
    })
  })

  // ---- PUT /tunnels/:id (update) ----
  describe('PUT /tunnels/:id', () => {
    it('updates tunnel fields (nominal)', async () => {
      await env.app.inject({ method: 'POST', url: '/tunnels', headers: await adminAuth(), payload: SAMPLE_TUNNEL })
      const res = await env.app.inject({
        method: 'PUT', url: '/tunnels/paris', headers: await adminAuth(),
        payload: { ip: '10.0.0.1', bandwidth: { up: 200 } },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().ip).toBe('10.0.0.1')
      expect(res.json().bandwidth.up).toBe(200)
      expect(res.json().id).toBe('paris') // immutable
    })

    it('deep merges bandwidth (down preserved)', async () => {
      await env.app.inject({ method: 'POST', url: '/tunnels', headers: await adminAuth(), payload: SAMPLE_TUNNEL })
      const res = await env.app.inject({
        method: 'PUT', url: '/tunnels/paris', headers: await adminAuth(),
        payload: { bandwidth: { up: 500 } },
      })
      expect(res.json().bandwidth.down).toBe(96)
    })

    it('returns 404 for unknown tunnel', async () => {
      const res = await env.app.inject({
        method: 'PUT', url: '/tunnels/missing', headers: await adminAuth(),
        payload: { ip: '1.2.3.4' },
      })
      expect(res.statusCode).toBe(404)
    })

    it('returns 422 for invalid ssh_port', async () => {
      await env.app.inject({ method: 'POST', url: '/tunnels', headers: await adminAuth(), payload: SAMPLE_TUNNEL })
      const res = await env.app.inject({
        method: 'PUT', url: '/tunnels/paris', headers: await adminAuth(),
        payload: { ssh_port: 99999 },
      })
      expect(res.statusCode).toBe(422)
    })

    it('returns 403 for tech role', async () => {
      await env.app.inject({ method: 'POST', url: '/tunnels', headers: await adminAuth(), payload: SAMPLE_TUNNEL })
      const res = await env.app.inject({
        method: 'PUT', url: '/tunnels/paris', headers: await techAuth(),
        payload: { ip: 'x' },
      })
      expect(res.statusCode).toBe(403)
    })
  })

  // ---- DELETE /tunnels/:id ----
  describe('DELETE /tunnels/:id', () => {
    it('deletes a tunnel (nominal)', async () => {
      await env.app.inject({ method: 'POST', url: '/tunnels', headers: await adminAuth(), payload: SAMPLE_TUNNEL })
      const res = await env.app.inject({ method: 'DELETE', url: '/tunnels/paris', headers: await adminAuth() })
      expect(res.statusCode).toBe(204)
      // confirm deletion
      const getRes = await env.app.inject({ method: 'GET', url: '/tunnels/paris', headers: await adminAuth() })
      expect(getRes.statusCode).toBe(404)
    })

    it('returns 404 for unknown tunnel', async () => {
      const res = await env.app.inject({ method: 'DELETE', url: '/tunnels/missing', headers: await adminAuth() })
      expect(res.statusCode).toBe(404)
    })

    it('returns 403 for tech role', async () => {
      await env.app.inject({ method: 'POST', url: '/tunnels', headers: await adminAuth(), payload: SAMPLE_TUNNEL })
      const res = await env.app.inject({ method: 'DELETE', url: '/tunnels/paris', headers: await techAuth() })
      expect(res.statusCode).toBe(403)
    })
  })

  // ---- Lifecycle (stubs) ----
  describe('POST /tunnels/:id/start|stop|restart', () => {
    it('start returns stub status', async () => {
      await env.app.inject({ method: 'POST', url: '/tunnels', headers: await adminAuth(), payload: SAMPLE_TUNNEL })
      const res = await env.app.inject({ method: 'POST', url: '/tunnels/paris/start', headers: await techAuth() })
      expect(res.statusCode).toBe(200)
      expect(res.json().id).toBe('paris')
    })

    it('stop returns stub status', async () => {
      await env.app.inject({ method: 'POST', url: '/tunnels', headers: await adminAuth(), payload: SAMPLE_TUNNEL })
      const res = await env.app.inject({ method: 'POST', url: '/tunnels/paris/stop', headers: await techAuth() })
      expect(res.statusCode).toBe(200)
    })

    it('restart returns stub status', async () => {
      await env.app.inject({ method: 'POST', url: '/tunnels', headers: await adminAuth(), payload: SAMPLE_TUNNEL })
      const res = await env.app.inject({ method: 'POST', url: '/tunnels/paris/restart', headers: await techAuth() })
      expect(res.statusCode).toBe(200)
    })

    it('start returns 403 for tech not scoped', async () => {
      await env.app.inject({
        method: 'POST', url: '/tunnels', headers: await adminAuth(),
        payload: { ...SAMPLE_TUNNEL, id: 'london' },
      })
      const res = await env.app.inject({ method: 'POST', url: '/tunnels/london/start', headers: await techAuth() })
      expect(res.statusCode).toBe(403)
    })

    it('start returns 404 for unknown tunnel', async () => {
      const res = await env.app.inject({ method: 'POST', url: '/tunnels/missing/start', headers: await adminAuth() })
      expect(res.statusCode).toBe(404)
    })
  })
})
