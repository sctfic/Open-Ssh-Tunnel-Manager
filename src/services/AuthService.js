import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'
import { UnauthorizedError } from '../utils/errors.js'

/**
 * Authentication service: login, JWT issue/verify/refresh, logout blacklist.
 * The blacklist is an in-memory Map (survives only within process lifetime).
 */
export class AuthService {
  constructor({ userRepository, jwtSecret, accessSeconds, refreshSeconds }) {
    this.userRepository = userRepository
    this.jwtSecret = jwtSecret
    this.accessSeconds = accessSeconds
    this.refreshSeconds = refreshSeconds

    this._blacklist = new Map()
    this._pruneInterval = setInterval(() => this._prune(), 60_000)
    this._pruneInterval.unref()
  }

  close() {
    clearInterval(this._pruneInterval)
  }

  async login(username, password) {
    const user = await this.userRepository.findByUsername(username)
    if (!user) throw new UnauthorizedError('Invalid credentials')

    const match = await bcrypt.compare(password, user.password_hash)
    if (!match) throw new UnauthorizedError('Invalid credentials')

    const accessToken = this._signAccessToken(user)
    const refreshToken = this._signRefreshToken(user)

    const { password_hash, ...safeUser } = user
    return { accessToken, refreshToken, user: safeUser }
  }

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

  async logout(token) {
    try {
      const payload = jwt.decode(token)
      if (payload && payload.jti) {
        this._blacklist.set(payload.jti, payload.exp)
      }
    } catch {
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

  _prune() {
    const now = Math.floor(Date.now() / 1000)
    for (const [jti, exp] of this._blacklist) {
      if (exp <= now) this._blacklist.delete(jti)
    }
  }
}

export default AuthService
