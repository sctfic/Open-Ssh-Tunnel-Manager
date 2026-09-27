import { z } from 'zod';

/**
 * Validation centralisée des données qui entrent dans le backend.
 *
 * Une route ne doit jamais écrire directement son `request.body` dans un fichier :
 * elle passe d'abord par l'un des schémas ci-dessous. `.strict()` est important,
 * car il fait échouer les anciennes propriétés ou les fautes de frappe au lieu de
 * les ignorer silencieusement.
 */
export const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$/);
const port = z.number().int().min(1).max(65535);
const host = z.string().min(1).max(253).regex(/^[a-zA-Z0-9_.:%-]+$/);
// Une adresse d'écoute vide demande à SSH/Node d'écouter sur toutes les
// interfaces. Les destinations restent obligatoirement des hôtes explicites.
const listenHost = z.union([z.literal(''), host]);
// Les débits sont exprimés en Ko/s décimaux : 1 Ko = 1 000 octets. Zéro = illimité.
export const bandwidth = z.object({ up: z.number().min(0).max(10000000), down: z.number().min(0).max(10000000) }).strict();
const channel = z.object({ name: z.string().min(1).max(100), listen_port: port, listen_host: listenHost.default('127.0.0.1'), endpoint_host: host.optional(), endpoint_port: port.optional() }).strict();
export const channelInput = channel.extend({ type: z.enum(['-L', '-R', '-D']) }).superRefine((c, ctx) => {
  // Un proxy SOCKS (-D) choisit sa destination à chaque connexion cliente.
  if (c.type !== '-D' && (!c.endpoint_host || !c.endpoint_port)) ctx.addIssue({ code: 'custom', message: 'Endpoint required for -L and -R' });
});
const channels = z.object({ '-L': z.record(z.string(), channel), '-R': z.record(z.string(), channel), '-D': z.record(z.string(), channel) }).strict().superRefine((groups, ctx) => {
  for (const [type, entries] of Object.entries(groups)) for (const [key, c] of Object.entries(entries)) {
    // Le port sert aussi de clé JSON afin de détecter rapidement les doublons.
    if (key !== String(c.listen_port)) ctx.addIssue({ code: 'custom', message: 'Channel key must match listen_port' });
    if (type !== '-D' && (!c.endpoint_host || !c.endpoint_port)) ctx.addIssue({ code: 'custom', message: 'Endpoint required' });
  }
});
export const tunnel = z.object({
  ip: host, ssh_port: port.default(22), user: z.string().regex(/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,63}$/),
  ssh_key: z.string().max(4096).default(''),
  hostFingerprint: z.string().regex(/^SHA256:[A-Za-z0-9+/]{43}$/),
  options: z.object({ compression: z.enum(['yes', 'no']).default('yes'), ServerAliveInterval: z.number().int().min(1).max(3600).default(10), ServerAliveCountMax: z.number().int().min(1).max(100).default(3) }).strict().default({ compression: 'yes', ServerAliveInterval: 10, ServerAliveCountMax: 3 }),
  bandwidth: bandwidth.default({ up: 0, down: 0 }),
  tunnels: channels.default({ '-L': {}, '-R': {}, '-D': {} })
}).strict();
// Le propriétaire de l'instance choisit sa propre politique : une chaîne vide
// est donc techniquement valide. La limite supérieure protège seulement la RAM.
export const password = z.string().max(1024);
export const userInput = z.object({ username: id, password }).strict();

// Erreur métier volontairement exposable au client HTTP.
export class HttpError extends Error { constructor(statusCode, message) { super(message); this.statusCode = statusCode; } }
// Équivalent lisible d'une assertion, avec un code HTTP adapté à l'API.
export function requireThat(condition, code, message) { if (!condition) throw new HttpError(code, message); }
