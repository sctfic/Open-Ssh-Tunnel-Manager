import { mkdir, readFile, writeFile, rename, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { id, HttpError } from './schema.js';

/**
 * Écrit un JSON de manière atomique : le contenu complet est d'abord placé dans
 * un fichier temporaire, puis `rename` le publie en une seule opération. Un crash
 * ne laisse donc pas un users.json ou un tunnel à moitié écrit.
 */
export async function atomicJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    await rename(temp, file);
  } finally { await rm(temp, { force: true }); }
}
export async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT' && fallback !== undefined) return fallback; throw e; }
}
export class Store {
  constructor(dir) { this.dir = path.resolve(dir); this.tail = Promise.resolve(); }
  file(name) { return path.join(this.dir, name); }
  /**
   * File d'attente en mémoire pour les mutations. Toutes les opérations qui
   * lisent-modifient-écrivent plusieurs fichiers passent par `exclusive` depuis
   * app.js. L'affectation de `tail` absorbe l'erreur afin que la mutation suivante
   * puisse toujours démarrer.
   */
  exclusive(fn) { const next = this.tail.then(fn); this.tail = next.catch(() => {}); return next; }
  async init() { await mkdir(this.file('tunnels'), { recursive: true, mode: 0o700 }); }
  async users() { return readJson(this.file('users.json'), {}); }
  async saveUsers(users) { await atomicJson(this.file('users.json'), users); }
  async configs() {
    const result = {};
    // Un fichier JSON représente exactement un tunnel ; son nom est son identifiant.
    for (const name of await readdir(this.file('tunnels'))) if (name.endsWith('.json')) {
      const key = id.parse(name.slice(0, -5)); result[key] = await readJson(this.file(`tunnels/${key}.json`));
    }
    return result;
  }
  async get(key) {
    id.parse(key);
    try { return await readJson(this.file(`tunnels/${key}.json`)); } catch (e) { if (e.code === 'ENOENT') throw new HttpError(404, 'Tunnel not found'); throw e; }
  }
  async put(key, config) { id.parse(key); await atomicJson(this.file(`tunnels/${key}.json`), config); }
  async remove(key) { id.parse(key); await rm(this.file(`tunnels/${key}.json`)); }
  async desired() { return readJson(this.file('desired.json'), []); }
  // `desired.json` mémorise les tunnels à relancer après un redémarrage du backend.
  async setDesired(ids) { await atomicJson(this.file('desired.json'), ids); }
}
