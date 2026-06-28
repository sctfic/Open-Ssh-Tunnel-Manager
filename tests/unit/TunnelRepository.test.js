import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { TunnelRepository } from '../../src/repositories/TunnelRepository.js'
import { useTempDir } from '../helpers/mockFs.js'

const SAMPLE_TUNNEL = {
  id: 'paris',
  user: 'ssh_user',
  ip: '192.168.1.10',
  ssh_port: 22,
  ssh_key: '/path/to/key',
  options: { compression: 'yes', ServerAliveInterval: 10, ServerAliveCountMax: 3 },
  bandwidth: { up: 132, down: 96 },
  tunnels: {
    '-L': {
      '9101': { name: 'printer1', listen_port: 9101, endpoint_host: 'printer', endpoint_port: 9100 },
    },
    '-R': {
      '5000': { name: 'camera1', listen_port: 5000, listen_host: 'camera', endpoint_host: '127.0.0.1', endpoint_port: 8080 },
    },
    '-D': {
      '4443': { name: 'proxy1', listen_port: 4443 },
    },
  },
}

describe('TunnelRepository', () => {
  const tmp = useTempDir()

  beforeEach(() => tmp.setup())
  afterEach(() => tmp.cleanup())

  function makeRepo() {
    return new TunnelRepository({ dir: tmp.path })
  }

  describe('listIds', () => {
    it('returns empty array when dir is empty', async () => {
      const repo = makeRepo()
      const ids = await repo.listIds()
      expect(ids).toEqual([])
    })

    it('returns tunnel ids from .json files', async () => {
      writeFileSync(join(tmp.path, 'paris.json'), JSON.stringify(SAMPLE_TUNNEL))
      writeFileSync(join(tmp.path, 'london.json'), JSON.stringify({ id: 'london' }))
      writeFileSync(join(tmp.path, 'readme.txt'), 'not a tunnel')

      const repo = makeRepo()
      const ids = await repo.listIds()
      expect(ids).toEqual(['london', 'paris']) // sorted alphabetically
    })
  })

  describe('get', () => {
    it('returns tunnel config by id', async () => {
      writeFileSync(join(tmp.path, 'paris.json'), JSON.stringify(SAMPLE_TUNNEL))
      const repo = makeRepo()
      const cfg = await repo.get('paris')
      expect(cfg.id).toBe('paris')
      expect(cfg.user).toBe('ssh_user')
      expect(cfg.bandwidth).toEqual({ up: 132, down: 96 })
      expect(cfg.tunnels['-L']['9101'].name).toBe('printer1')
    })

    it('throws NotFoundError when tunnel does not exist', async () => {
      const repo = makeRepo()
      await expect(repo.get('missing')).rejects.toMatchObject({
        statusCode: 404,
      })
    })
  })

  describe('save', () => {
    it('creates a new tunnel config file', async () => {
      const repo = makeRepo()
      await repo.save(SAMPLE_TUNNEL)
      const cfg = await repo.get('paris')
      expect(cfg).toEqual(SAMPLE_TUNNEL)
    })

    it('throws ConflictError when tunnel id already exists', async () => {
      writeFileSync(join(tmp.path, 'paris.json'), JSON.stringify(SAMPLE_TUNNEL))
      const repo = makeRepo()
      await expect(repo.save(SAMPLE_TUNNEL)).rejects.toMatchObject({
        statusCode: 409,
      })
    })

    it('throws when config has no id', async () => {
      const repo = makeRepo()
      await expect(repo.save({ user: 'foo' })).rejects.toThrow('must contain an id')
    })
  })

  describe('update', () => {
    it('merges patch into existing config', async () => {
      writeFileSync(join(tmp.path, 'paris.json'), JSON.stringify(SAMPLE_TUNNEL))
      const repo = makeRepo()
      const updated = await repo.update('paris', { ip: '10.0.0.1', bandwidth: { up: 200 } })
      expect(updated.ip).toBe('10.0.0.1')
      expect(updated.bandwidth.up).toBe(200)
      // Deep merge: bandwidth.down should be preserved
      expect(updated.bandwidth.down).toBe(96)
      // id is immutable
      expect(updated.id).toBe('paris')
    })

    it('throws NotFoundError when tunnel does not exist', async () => {
      const repo = makeRepo()
      await expect(repo.update('missing', { ip: 'x' })).rejects.toMatchObject({
        statusCode: 404,
      })
    })
  })

  describe('remove', () => {
    it('deletes the tunnel config file', async () => {
      writeFileSync(join(tmp.path, 'paris.json'), JSON.stringify(SAMPLE_TUNNEL))
      const repo = makeRepo()
      const result = await repo.remove('paris')
      expect(result).toBe(true)
      await expect(repo.get('paris')).rejects.toMatchObject({ statusCode: 404 })
    })

    it('throws NotFoundError when tunnel does not exist', async () => {
      const repo = makeRepo()
      await expect(repo.remove('missing')).rejects.toMatchObject({ statusCode: 404 })
    })
  })

  describe('exists', () => {
    it('returns true when file exists', async () => {
      writeFileSync(join(tmp.path, 'paris.json'), '{}')
      const repo = makeRepo()
      expect(await repo.exists('paris')).toBe(true)
    })

    it('returns false when file does not exist', async () => {
      const repo = makeRepo()
      expect(await repo.exists('missing')).toBe(false)
    })
  })
})
