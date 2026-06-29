import { BaseJsonRepository } from './BaseJsonRepository.js'
import { NotFoundError, ConflictError } from '../utils/errors.js'

/**
 * Repository for user accounts, stored in a single JSON file:
 *   { "users": [ { username, password_hash, role, tunnels? }, ... ] }
 */
export class UserRepository {
  constructor({ filePath }) {
    this.repo = new BaseJsonRepository({
      filePath,
      defaultValue: { users: [] },
    })
  }

  async _read() {
    return this.repo._read()
  }

  async _write(data) {
    await this.repo._write(data)
  }

  async list() {
    const data = await this._read()
    return data.users.map(stripHash)
  }

  async get(username) {
    const data = await this._read()
    const user = data.users.find((u) => u.username === username)
    if (!user) throw new NotFoundError(`User '${username}' not found`)
    return stripHash(user)
  }

  async findByUsername(username) {
    const data = await this._read()
    return data.users.find((u) => u.username === username) ?? null
  }

  async create(user) {
    const data = await this._read()
    if (data.users.some((u) => u.username === user.username)) {
      throw new ConflictError(`User '${user.username}' already exists`)
    }
    data.users.push(user)
    await this._write(data)
    return stripHash(user)
  }

  async update(username, patch) {
    const data = await this._read()
    const idx = data.users.findIndex((u) => u.username === username)
    if (idx === -1) throw new NotFoundError(`User '${username}' not found`)

    if (patch.username && patch.username !== username) {
      if (data.users.find((u) => u.username === patch.username)) {
        throw new ConflictError(`User '${patch.username}' already exists`)
      }
    }

    data.users[idx] = { ...data.users[idx], ...patch, username }
    await this._write(data)
    return stripHash(data.users[idx])
  }

  async remove(username) {
    const data = await this._read()
    const idx = data.users.findIndex((u) => u.username === username)
    if (idx === -1) throw new NotFoundError(`User '${username}' not found`)
    data.users.splice(idx, 1)
    await this._write(data)
    return true
  }
}

function stripHash(user) {
  const { password_hash, ...safe } = user
  return safe
}

export default UserRepository
