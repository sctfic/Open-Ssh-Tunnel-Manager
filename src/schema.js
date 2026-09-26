import { z } from 'zod';

export const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$/);
const port = z.number().int().min(1).max(65535);
const host = z.string().min(1).max(253).regex(/^[a-zA-Z0-9_.:%-]+$/);
export const bandwidth = z.object({ up: z.number().min(0).max(10000000), down: z.number().min(0).max(10000000) }).strict();
const channel = z.object({ name: z.string().min(1).max(100), listen_port: port, listen_host: host.default('127.0.0.1'), endpoint_host: host.optional(), endpoint_port: port.optional() }).strict();
export const channelInput = channel.extend({ type: z.enum(['-L', '-R', '-D']) }).superRefine((c, ctx) => {
  if (c.type !== '-D' && (!c.endpoint_host || !c.endpoint_port)) ctx.addIssue({ code: 'custom', message: 'Endpoint required for -L and -R' });
});
const channels = z.object({ '-L': z.record(z.string(), channel), '-R': z.record(z.string(), channel), '-D': z.record(z.string(), channel) }).strict().superRefine((groups, ctx) => {
  for (const [type, entries] of Object.entries(groups)) for (const [key, c] of Object.entries(entries)) {
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
export const password = z.string().min(12).max(1024);
export const userInput = z.object({ username: id, password }).strict();
export class HttpError extends Error { constructor(statusCode, message) { super(message); this.statusCode = statusCode; } }
export function requireThat(condition, code, message) { if (!condition) throw new HttpError(code, message); }
