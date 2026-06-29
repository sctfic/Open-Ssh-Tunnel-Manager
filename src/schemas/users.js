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
