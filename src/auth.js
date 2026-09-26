import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { requireThat } from './schema.js';
const scrypt = promisify(scryptCb);

/**
 * Authentification applicative sans dépendre du compte SSH distant.
 * Les sessions restent uniquement en mémoire : redémarrer le backend déconnecte
 * volontairement tous les clients. Les fichiers ne contiennent que des hashes.
 */
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password, encoded) {
  const [, salt, value] = (encoded || '').split(':');
  const actual = await scrypt(password, salt || 'missing-user-salt', 64);
  const expected = Buffer.from(value || '', 'hex');
  // `timingSafeEqual` évite qu'un attaquant déduise le hash via le temps de comparaison.
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
// Les niveaux sont cumulatifs : 4 inclut implicitement 3, 2 et 1.
export const level = (user, key) => user.username === 'root' ? 4 : (Object.hasOwn(user.rights, key) ? user.rights[key] : 0);
export const canManage = (user, configs) => user.username === 'root' || Object.keys(configs).some(key => level(user, key) === 4);
export class Auth {
  constructor(store, { ttl = 72 * 60 * 60 * 1000, maxSessions = 10000 } = {}) { this.store = store; this.ttl = ttl; this.maxSessions = maxSessions; this.sessions = new Map(); this.failures = new Map(); }
  // Même en mémoire, on indexe les sessions par digest et non par token brut.
  digest(token) { return createHash('sha256').update(token).digest('hex'); }
  async login(username, password, ip) {
    const now = Date.now();
    for (const [key, item] of this.failures) if (item.until <= now) this.failures.delete(key);
    const rate = this.failures.get(ip) || { count: 0, until: now + 60000 };
    requireThat(rate.count < 10, 429, 'Too many login attempts; retry in one minute');
    rate.count++; this.failures.set(ip, rate);
    const users = await this.store.users(); const user = users[username];
    // Un utilisateur inconnu exécute quand même scrypt, ce qui limite les écarts
    // de temps observables entre « compte absent » et « mauvais mot de passe ».
    const valid = await verifyPassword(password, user?.passwordHash);
    requireThat(valid && user && !user.disabled, 401, 'Invalid credentials');
    for (const [key, session] of this.sessions) if (session.expires <= now) this.sessions.delete(key);
    requireThat(this.sessions.size < this.maxSessions, 503, 'Session capacity reached');
    const token = randomBytes(32).toString('base64url'); const expires = now + this.ttl;
    this.sessions.set(this.digest(token), { username, expires });
    return { token, expiresAt: new Date(expires).toISOString() };
  }
  async authenticate(header) {
    requireThat(typeof header === 'string' && /^Bearer [A-Za-z0-9_-]{43}$/.test(header), 401, 'Authentication required');
    const token = header.slice(7); const session = this.sessions.get(this.digest(token));
    requireThat(session && session.expires > Date.now(), 401, 'Session expired or invalid');
    // Relire le compte rend une désactivation ou une révocation effective dès la
    // requête suivante, même si le token avait été créé auparavant.
    const user = (await this.store.users())[session.username];
    requireThat(user && !user.disabled, 401, 'Account unavailable');
    return { ...user, username: session.username };
  }
  logout(header) { if (header) this.sessions.delete(this.digest(header.slice(7))); }
  revoke(username) { for (const [key, value] of this.sessions) if (value.username === username) this.sessions.delete(key); }
}
