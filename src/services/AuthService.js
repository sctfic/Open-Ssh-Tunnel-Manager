import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'
import { UnauthorizedError } from '../utils/errors.js'

/**
<<<<<<< HEAD
 * Authentication service: login, JWT issue/verify/refresh, logout blacklist.
 * The blacklist is an in-memory Map (survives only within process lifetime).
 */
export class AuthService {
=======
 * Authentication service.
 *
 * Responsibilities:
 *   - Login with username + password (bcrypt verify)
 *   - Issue and verify JWT access + refresh tokens
 *   - Token rotation on refresh
 *   - Logout (blacklist current token jti)
 *
 * The blacklist is an in-memory Set (survives only within process lifetime).
 * For production at scale, this could be swapped for a Redis-backed store.
 */
export class AuthService {
  /**
   * @param {object} opts
   * @param {import('../repositories/UserRepository.js').UserRepository} opts.userRepository
   * @param {string} opts.jwtSecret
   * @param {number} opts.accessSeconds - TTL of access token in seconds
   * @param {number} opts.refreshSeconds - TTL of refresh token in seconds
   */
>>>>>>> 2a305446295e6de1ea540bcfa458df0c3ae6f10b
  constructor({ userRepository, jwtSecret, accessSeconds, refreshSeconds }) {
    this.userRepository = userRepository
    this.jwtSecret = jwtSecret
    this.accessSeconds = accessSeconds
    this.refreshSeconds = refreshSeconds

<<<<<<< HEAD
    this._blacklist = new Map()
    this._pruneInterval = setInterval(() => this._prune(), 60_000)
    this._pruneInterval.unref()
  }

=======
    // In-memory token blacklist (jti → expiry timestamp).
    // Pruned on every call to keep memory bounded.
    this._blacklist = new Map()
    this._pruneInterval = setInterval(() => this._prune(), 60_000)
    // Allow Node.js to exit even if this timer is running
    this._pruneInterval.unref()
  }

  /**
   * Close internal resources (timers).
   */
>>>>>>> 2a305446295e6de1ea540bcfa458df0c3ae6f10b
  close() {
    clearInterval(this._pruneInterval)
  }

<<<<<<< HEAD
  async login(username, password) {
    const user = await this.userRepository.findByUsername(username)
    if (!user) throw new UnauthorizedError('Invalid credentials')

    const match = await bcrypt.compare(password, user.password_hash)
    if (!match) throw new UnauthorizedError('Invalid credentials')
=======
  /**
   * Authenticate a user and issue tokens.
   * @param {string} username
   * @param {string} password (plaintext)
   * @returns {Promise<{accessToken: string, refreshToken: string, user: object}>}
   */
  async login(username, password) {
    const user = await this.userRepository.findByUsername(username)
    if (!user) {
      throw new UnauthorizedError('Invalid credentials')
    }

    const match = await bcrypt.compare(password, user.password_hash)
    if (!match) {
      throw new UnauthorizedError('Invalid credentials')
    }
>>>>>>> 2a305446295e6de1ea540bcfa458df0c3ae6f10b

    const accessToken = this._signAccessToken(user)
    const refreshToken = this._signRefreshToken(user)

    const { password_hash, ...safeUser } = user
    return { accessToken, refreshToken, user: safeUser }
  }

<<<<<<< HEAD
  async verifyToken(token) {
    let payload
    try {
      payload = jwt.verify(token, this.jwtSecret)
    } catch {
      throw new UnauthorizedError('Invalid or expired token')
    }
    if (payload.type !== 'access') {
      throw new UnauthorizedError('Invalid token type')
    }
    if (this._blacklist.has(payload.jti)) {
      throw new UnauthorizedError('Token has been revoked')
    }
    return payload
  }

  async refresh(refreshToken) {
    let payload
    try {
      payload = jwt.verify(refreshToken, this.jwtSecret)
    } catch {
      throw new UnauthorizedError('Invalid or expired refresh token')
    }
    if (payload.type !== 'refresh') {
      throw new UnauthorizedError('Invalid token type')
    }
    if (this._blacklist.has(payload.jti)) {
      throw new UnauthorizedError('Token has been revoked')
    }

    const user = await this.userRepository.findByUsername(payload.sub)
    if (!user) throw new UnauthorizedError('User no longer exists')

    // Rotate: blacklist the old refresh token
    this._blacklist.set(payload.jti, payload.exp)

    return {
      accessToken: this._signAccessToken(user),
      refreshToken: this._signRefreshToken(user),
    }
  }

=======
  /**
   * Verify an access token and return its decoded payload.
   * @param {string} token
   * @returns {Promise<object>} decoded JWT payload
   * @throws {UnauthorizedError}
   */
  async verifyToken(token) {
    try {
      const payload = jwt.verify(token, this.jwtSecret)
      if (payload.type !== 'access') {
        throw new UnauthorizedError('Invalid token type')
      }
      if (this._blacklist.has(payload.jti)) {
        throw new UnauthorizedError('Token has been revoked')
      }
      return payload
    } catch (err) {
      if (err instanceof UnauthorizedError) throw err
      throw new UnauthorizedError('Invalid or expired token')
    }
  }

  /**
   * Exchange a valid refresh token for new tokens (rotation).
   * @param {string} refreshToken
   * @returns {Promise<{accessToken: string, refreshToken: string}>}
   * @throws {UnauthorizedError}
   */
  async refresh(refreshToken) {
    try {
      const payload = jwt.verify(refreshToken, this.jwtSecret)
      if (payload.type !== 'refresh') {
        throw new UnauthorizedError('Invalid token type')
      }
      if (this._blacklist.has(payload.jti)) {
        throw new UnauthorizedError('Token has been revoked')
      }

      // Look up user (still exists? still valid role?)
      const user = await this.userRepository.findByUsername(payload.sub)
      if (!user) {
        throw new UnauthorizedError('User no longer exists')
      }

      // Blacklist the old refresh token (rotation)
      this._blacklist.set(payload.jti, payload.exp)

      const newAccessToken = this._signAccessToken(user)
      const newRefreshToken = this._signRefreshToken(user)
      return { accessToken: newAccessToken, refreshToken: newRefreshToken }
    } catch (err) {
      if (err instanceof UnauthorizedError) throw err
      throw new UnauthorizedError('Invalid or expired refresh token')
    }
  }

  /**
   * Revoke a token by adding its jti to the blacklist.
   * @param {string} token
   */
>>>>>>> 2a305446295e6de1ea540bcfa458df0c3ae6f10b
  async logout(token) {
    try {
      const payload = jwt.decode(token)
      if (payload && payload.jti) {
        this._blacklist.set(payload.jti, payload.exp)
      }
    } catch {
<<<<<<< HEAD
      // nothing to blacklist
    }
  }

  _signAccessToken(user) {
    return jwt.sign(
      { sub: user.username, role: user.role, tunnels: user.tunnels || [], type: 'access' },
      this.jwtSecret,
      { expiresIn: this.accessSeconds, jwtid: randomUUID() }
    )
  }

  _signRefreshToken(user) {
    return jwt.sign(
      { sub: user.username, role: user.role, type: 'refresh' },
      this.jwtSecret,
      { expiresIn: this.refreshSeconds, jwtid: randomUUID() }
    )
  }

=======
      // If we can't decode, there's nothing to blacklist — ignore.
    }
  }

  /**
   * Sign an access token.
   * @private
   */
  _signAccessToken(user) {
    return jwt.sign(
      {
        sub: user.username,
        role: user.role,
        tunnels: user.tunnels || [],
        type: 'access',
      },
      this.jwtSecret,
      {
        expiresIn: this.accessSeconds,
        jwtid: this._generateJti(),
      }
    )
  }

  /**
   * Sign a refresh token.
   * @private
   */
  _signRefreshToken(user) {
    return jwt.sign(
      {
        sub: user.username,
        role: user.role,
        type: 'refresh',
      },
      this.jwtSecret,
      {
        expiresIn: this.refreshSeconds,
        jwtid: this._generateJti(),
      }
    )
  }

  /**
   * Generate a unique JWT ID.
   * @private
   */
  _generateJti() {
    return randomUUID()
  }

  /**
   * Prune expired entries from the blacklist.
   * @private
   */
>>>>>>> 2a305446295e6de1ea540bcfa458df0c3ae6f10b
  _prune() {
    const now = Math.floor(Date.now() / 1000)
    for (const [jti, exp] of this._blacklist) {
      if (exp <= now) this._blacklist.delete(jti)
    }
  }
}

export default AuthService
