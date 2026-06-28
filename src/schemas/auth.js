/**
 * AJV schemas for auth routes.
 */
export const loginBody = {
  type: 'object',
  required: ['username', 'password'],
  additionalProperties: false,
  properties: {
    username: { type: 'string', minLength: 1 },
    password: { type: 'string', minLength: 1 },
  },
}

export const logoutBody = {
  type: 'object',
  required: ['refreshToken'],
  additionalProperties: false,
  properties: {
    refreshToken: { type: 'string', minLength: 1 },
  },
}

export const refreshBody = {
  type: 'object',
  required: ['refreshToken'],
  additionalProperties: false,
  properties: {
    refreshToken: { type: 'string', minLength: 1 },
  },
}

export const authResponse = {
  200: {
    type: 'object',
    required: ['accessToken', 'refreshToken', 'user'],
    properties: {
      accessToken: { type: 'string' },
      refreshToken: { type: 'string' },
      user: {
        type: 'object',
        required: ['username', 'role'],
        properties: {
          username: { type: 'string' },
          role: { type: 'string', enum: ['admin', 'tech'] },
          tunnels: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
}
