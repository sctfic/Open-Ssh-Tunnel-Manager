import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { UserRepository } from '../../src/repositories/UserRepository.js'
import { useTempDir } from '../helpers/mockFs.js'

const USERS_FILE_DATA = {
  users: [
    { username: 'admin', password_hash: '$2b$10$xxx', role: 'admin' },
    { username: 'tech1', password_hash: '$2b$10$yyy', role: 'tech', tunnels: ['paris'] },
  ],
}

describe('UserRepository', () => {
  const tmp = useTempDir()
  const filePath = () => join(tmp.path, 'users.json')

  beforeEach(() => {
    tmp.setup()
    writeFileSync(filePath(), JSON.stringify(USERS_FILE_DATA))
  })
  afterEach(() => tmp.cleanup())

  function makeRepo() {
    return new UserRepository({ filePath: filePath() })
  }

  describe('list', () => {
    it('returns all users without password_hash', async () => {
      const repo = makeRepo()
      const users = await repo.list()
      expect(users).toHaveLength(2)
      expect(users[0].username).toBe('admin')
      expect(users[0]).not.toHaveProperty('password_hash')
      expect(users[1].username).toBe('tech1')
    })

    it('returns empty array when file is empty', async () => {
      writeFileSync(filePath(), JSON.stringify({ users: [] }))
      const repo = makeRepo()
      const users = await repo.list()
      expect(users).toEqual([])
    })
  })

  describe('get', () => {
    it('returns a user without password_hash', async () => {
      const repo = makeRepo()
      const user = await repo.get('admin')
      expect(user.username).toBe('admin')
      expect(user.role).toBe('admin')
      expect(user).not.toHaveProperty('password_hash')
    })

    it('throws NotFoundError for unknown user', async () => {
      const repo = makeRepo()
      await expect(repo.get('nobody')).rejects.toMatchObject({ statusCode: 404 })
    })
  })

  describe('findByUsername', () => {
    it('returns full user with password_hash', async () => {
      const repo = makeRepo()
      const user = await repo.findByUsername('tech1')
      expect(user.username).toBe('tech1')
      expect(user.password_hash).toBe('$2b$10$yyy')
    })

    it('returns null for unknown user', async () => {
      const repo = makeRepo()
      const user = await repo.findByUsername('nobody')
      expect(user).toBeNull()
    })
  })

  describe('create', () => {
    it('adds a new user', async () => {
      const repo = makeRepo()
      await repo.create({ username: 'tech2', password_hash: 'hash123', role: 'tech', tunnels: [] })
      const users = await repo.list()
      expect(users).toHaveLength(3)
      const full = await repo.findByUsername('tech2')
      expect(full.password_hash).toBe('hash123')
    })

    it('throws ConflictError for duplicate username', async () => {
      const repo = makeRepo()
      await expect(
        repo.create({ username: 'admin', password_hash: 'h', role: 'tech' })
      ).rejects.toMatchObject({ statusCode: 409 })
    })

    it('returns user without hash', async () => {
      const repo = makeRepo()
      const user = await repo.create({ username: 'new', password_hash: 'h', role: 'admin' })
      expect(user).not.toHaveProperty('password_hash')
      expect(user.username).toBe('new')
    })
  })

  describe('update', () => {
    it('patches existing user fields', async () => {
      const repo = makeRepo()
      const updated = await repo.update('tech1', { role: 'admin', tunnels: ['paris', 'london'] })
      expect(updated.role).toBe('admin')
      expect(updated.tunnels).toEqual(['paris', 'london'])
    })

    it('preserves password_hash if patch does not include it', async () => {
      const repo = makeRepo()
      await repo.update('admin', { role: 'tech' })
      const full = await repo.findByUsername('admin')
      expect(full.password_hash).toBe('$2b$10$xxx')
    })

    it('allows updating password_hash', async () => {
      const repo = makeRepo()
      await repo.update('admin', { password_hash: 'new_hash' })
      const full = await repo.findByUsername('admin')
      expect(full.password_hash).toBe('new_hash')
    })

    it('throws NotFoundError for unknown user', async () => {
      const repo = makeRepo()
      await expect(repo.update('nobody', { role: 'tech' })).rejects.toMatchObject({ statusCode: 404 })
    })

    it('throws ConflictError when renaming to an existing username', async () => {
      const repo = makeRepo()
      await expect(
        repo.update('tech1', { username: 'admin' })
      ).rejects.toMatchObject({ statusCode: 409 })
    })
  })

  describe('remove', () => {
    it('deletes an existing user', async () => {
      const repo = makeRepo()
      await repo.remove('tech1')
      const users = await repo.list()
      expect(users).toHaveLength(1)
      expect(users[0].username).toBe('admin')
    })

    it('throws NotFoundError for unknown user', async () => {
      const repo = makeRepo()
      await expect(repo.remove('nobody')).rejects.toMatchObject({ statusCode: 404 })
    })
  })
})
