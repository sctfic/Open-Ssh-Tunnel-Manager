import { BaseJsonRepository } from './BaseJsonRepository.js'
import { NotFoundError, ConflictError } from '../utils/errors.js'

/**
 * Repository for user accounts.
 *
 * Users are stored in a single JSON file with the format:
 *   { "users": [ { username, password_hash, role, tunnels? }, ... ] }
 *
 * The file path is configurable (default: config/users.json).
 */
export class UserRepository {
  /**
   * @param {object} opts
   * @param {string} opts.filePath - path to users.json
   */
  constructor({ filePath }) {
    this.repo = new BaseJsonRepository({
      filePath,
      defaultValue: { users: [] },
    })
  }

  /**
   * Read the full users file.
   * @returns {Promise<{ users: object[] }>}
   */
  async _read() {
    return this.repo._read()
  }

  /**
   * Write the full users file atomically.
   * @param {{ users: object[] }} data
   */
  async _write(data) {
    await this.repo._write(data)
  }

  /**
   * List all users (without password hashes).
   * @returns {Promise<object[]>} users with password_hash stripped
   */
  async list() {
    const data = await this._read()
    return data.users.map(stripHash)
  }

  /**
   * Get a single user by username.
   * @param {string} username
   * @returns {Promise<object>} user without password_hash
   * @throws {NotFoundError}
   */
  async get(username) {
    const data = await this._read()
    const user = data.users.find((u) => u.username === username)
    if (!user) {
      throw new NotFoundError(`User '${username}' not found`)
    }
    return stripHash(user)
  }

  /**
   * Get a user **with** password_hash (for auth checks).
   * @param {string} username
   * @returns {Promise<object|null>} full user or null
   */
  async findByUsername(username) {
    const data = await this._read()
    return data.users.find((u) => u.username === username) ?? null
  }

  /**
   * Create a new user.
   * @param {object} user - { username, password_hash, role, tunnels? }
   * @returns {Promise<object>} the created user (without hash)
   * @throws {ConflictError} if username already exists
   */
  async create(user) {
    const data = await this._read()
    if (data.users.some((u) => u.username === user.username)) {
      throw new ConflictError(`User '${user.username}' already exists`)
    }
    data.users.push(user)
    await this._write(data)
    return stripHash(user)
  }

  /**
   * Update an existing user (partial).
   * @param {string} username
   * @param {object} patch - fields to merge
   * @returns {Promise<object>} updated user (without hash)
   * @throws {NotFoundError}
   */
  async update(username, patch) {
    const data = await this._read()
    const idx = data.users.findIndex((u) => u.username === username)
    if (idx === -1) {
      throw new NotFoundError(`User '${username}' not found`)
    }

    // Prevent username change via update (would require rename logic)
    if (patch.username && patch.username !== username) {
      const dup = data.users.find((u) => u.username === patch.username)
      if (dup) {
        throw new ConflictError(`User '${patch.username}' already exists`)
      }
    }

    data.users[idx] = { ...data.users[idx], ...patch, username } // keep original username
    await this._write(data)
    return stripHash(data.users[idx])
  }

  /**
   * Remove a user.
   * @param {string} username
   * @returns {Promise<boolean>} true if removed
   * @throws {NotFoundError}
   */
  async remove(username) {
    const data = await this._read()
    const idx = data.users.findIndex((u) => u.username === username)
    if (idx === -1) {
      throw new NotFoundError(`User '${username}' not found`)
    }
    data.users.splice(idx, 1)
    await this._write(data)
    return true
  }
}

/**
 * Return a copy of the user without the password_hash field.
 */
function stripHash(user) {
  const { password_hash, ...safe } = user
  return safe
}

export default UserRepository
