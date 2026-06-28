/**
 * AJV schemas for user routes.
 */

export const usernameParam = {
  type: 'object',
  required: ['username'],
  properties: {
    username: { type: 'string', minLength: 1, maxLength: 64 },
  },
}

export const createUserBody = {
  type: 'object',
  required: ['username', 'password', 'role'],
  additionalProperties: false,
  properties: {
    username: { type: 'string', minLength: 1, maxLength: 64 },
    password: { type: 'string', minLength: 4 },
    role: { type: 'string', enum: ['admin', 'tech'] },
    tunnels: { type: 'array', items: { type: 'string' } },
  },
}

export const updateUserBody = {
  type: 'object',
  additionalProperties: false,
  properties: {
    password: { type: 'string', minLength: 4 },
    role: { type: 'string', enum: ['admin', 'tech'] },
    tunnels: { type: 'array', items: { type: 'string' } },
  },
}

export const userResponse = {
  type: 'object',
  required: ['username', 'role'],
  properties: {
    username: { type: 'string' },
    role: { type: 'string', enum: ['admin', 'tech'] },
    tunnels: { type: 'array', items: { type: 'string' } },
  },
}

export const usersListResponse = {
  type: 'array',
  items: userResponse,
}

export const errorResponse = {
  type: 'object',
  required: ['error', 'code'],
  properties: {
    error: { type: 'string' },
    code: { type: 'number' },
  },
}
