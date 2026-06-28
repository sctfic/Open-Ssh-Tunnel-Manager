/**
 * AJV schemas for tunnel routes.
 *
 * The tunnel JSON format matches the spec exactly:
 *   { id, user, ip, ssh_port, ssh_key, options, bandwidth, tunnels: { -L, -R, -D } }
 */

export const tunnelIdParam = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', pattern: '^[a-zA-Z0-9_-]+$', minLength: 1, maxLength: 64 },
  },
}

const localForwardSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    name: { type: 'string' },
    listen_port: { type: 'integer', minimum: 1, maximum: 65535 },
    listen_host: { type: 'string' },
    endpoint_host: { type: 'string' },
    endpoint_port: { type: 'integer', minimum: 1, maximum: 65535 },
  },
  required: ['listen_port', 'endpoint_host', 'endpoint_port'],
}

const remoteForwardSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    name: { type: 'string' },
    listen_port: { type: 'integer', minimum: 1, maximum: 65535 },
    listen_host: { type: 'string' },
    endpoint_host: { type: 'string' },
    endpoint_port: { type: 'integer', minimum: 1, maximum: 65535 },
  },
  required: ['listen_port', 'endpoint_host', 'endpoint_port'],
}

const dynamicForwardSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    name: { type: 'string' },
    listen_port: { type: 'integer', minimum: 1, maximum: 65535 },
  },
  required: ['listen_port'],
}

const tunnelsObjectSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    '-L': { type: 'object', additionalProperties: localForwardSchema },
    '-R': { type: 'object', additionalProperties: remoteForwardSchema },
    '-D': { type: 'object', additionalProperties: dynamicForwardSchema },
  },
}

const optionsSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    compression: { type: 'string', enum: ['yes', 'no'] },
    ServerAliveInterval: { type: 'integer', minimum: 0 },
    ServerAliveCountMax: { type: 'integer', minimum: 0 },
  },
}

const bandwidthSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    up: { type: 'integer', minimum: 0 },
    down: { type: 'integer', minimum: 0 },
  },
}

export const createTunnelBody = {
  type: 'object',
  required: ['id', 'user', 'ip', 'ssh_port', 'ssh_key'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', pattern: '^[a-zA-Z0-9_-]+$', minLength: 1, maxLength: 64 },
    user: { type: 'string', minLength: 1 },
    ip: { type: 'string', minLength: 1 },
    ssh_port: { type: 'integer', minimum: 1, maximum: 65535 },
    ssh_key: { type: 'string', minLength: 1 },
    options: optionsSchema,
    bandwidth: bandwidthSchema,
    tunnels: tunnelsObjectSchema,
  },
}

export const updateTunnelBody = {
  type: 'object',
  additionalProperties: false,
  properties: {
    // id is NOT updatable
    user: { type: 'string', minLength: 1 },
    ip: { type: 'string', minLength: 1 },
    ssh_port: { type: 'integer', minimum: 1, maximum: 65535 },
    ssh_key: { type: 'string', minLength: 1 },
    options: optionsSchema,
    bandwidth: bandwidthSchema,
    // tunnels are managed via dedicated channel routes
  },
}

/** Re-export channel validation schemas for reuse. */
export {
  localForwardSchema,
  remoteForwardSchema,
  dynamicForwardSchema,
}
