/**
 * AJV schemas for channel routes (sub-resource of tunnels).
 *
 * A channel is one of:
 *   - Local Port Forwarding    (-L): listen_port -> endpoint_host:endpoint_port
 *   - Remote Port Forwarding   (-R): listen_host:listen_port <- endpoint_host:endpoint_port
 *   - Dynamic Port Forwarding  (-D): SOCKS5 on listen_port
 *
 * The channel key within the tunnels object is its listen_port (as a string).
 */

export const channelKindParam = {
  type: 'object',
  required: ['id', 'kind', 'port'],
  properties: {
    id: { type: 'string', pattern: '^[a-zA-Z0-9_-]+$' },
    kind: { type: 'string', enum: ['-L', '-R', '-D'] },
    port: { type: 'string', pattern: '^[0-9]+$' },
  },
}

const localChannelBody = {
  type: 'object',
  required: ['kind', 'listen_port', 'endpoint_host', 'endpoint_port'],
  additionalProperties: false,
  properties: {
    kind: { type: 'string', const: '-L' },
    name: { type: 'string' },
    listen_port: { type: 'integer', minimum: 1, maximum: 65535 },
    listen_host: { type: 'string' },
    endpoint_host: { type: 'string', minLength: 1 },
    endpoint_port: { type: 'integer', minimum: 1, maximum: 65535 },
  },
}

const remoteChannelBody = {
  type: 'object',
  required: ['kind', 'listen_port', 'endpoint_host', 'endpoint_port'],
  additionalProperties: false,
  properties: {
    kind: { type: 'string', const: '-R' },
    name: { type: 'string' },
    listen_port: { type: 'integer', minimum: 1, maximum: 65535 },
    listen_host: { type: 'string' },
    endpoint_host: { type: 'string', minLength: 1 },
    endpoint_port: { type: 'integer', minimum: 1, maximum: 65535 },
  },
}

const dynamicChannelBody = {
  type: 'object',
  required: ['kind', 'listen_port'],
  additionalProperties: false,
  properties: {
    kind: { type: 'string', const: '-D' },
    name: { type: 'string' },
    listen_port: { type: 'integer', minimum: 1, maximum: 65535 },
  },
}

/**
 * OneOf the three channel kinds. `kind` discriminates.
 */
export const createChannelBody = {
  oneOf: [localChannelBody, remoteChannelBody, dynamicChannelBody],
}

export const updateChannelBody = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    // listen_port is the key — not updatable
    listen_host: { type: 'string' },
    endpoint_host: { type: 'string' },
    endpoint_port: { type: 'integer', minimum: 1, maximum: 65535 },
  },
}

export {
  localChannelBody,
  remoteChannelBody,
  dynamicChannelBody,
}
