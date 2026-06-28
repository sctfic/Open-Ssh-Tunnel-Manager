/**
 * Domain error hierarchy.
 *
 * Every AppError carries:
 *   - `statusCode`: the HTTP status to send
 *   - `code`:       a short machine-readable code
 *   - `message`:    a human-readable message
 *
 * The error handler middleware converts any thrown AppError into a uniform
 * JSON response: { error, code }.
 */
export class AppError extends Error {
  constructor(message, { statusCode = 500, code = 'INTERNAL_ERROR', cause } = {}) {
    super(message, { cause })
    this.name = this.constructor.name
    this.statusCode = statusCode
    this.code = code
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation error', { code = 'VALIDATION_ERROR', cause } = {}) {
    super(message, { statusCode: 422, code, cause })
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', { code = 'UNAUTHORIZED', cause } = {}) {
    super(message, { statusCode: 401, code, cause })
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', { code = 'FORBIDDEN', cause } = {}) {
    super(message, { statusCode: 403, code, cause })
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found', { code = 'NOT_FOUND', cause } = {}) {
    super(message, { statusCode: 404, code, cause })
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', { code = 'CONFLICT', cause } = {}) {
    super(message, { statusCode: 409, code, cause })
  }
}

export class SshError extends AppError {
  constructor(message = 'SSH error', { code = 'SSH_ERROR', cause } = {}) {
    super(message, { statusCode: 502, code, cause })
  }
}

export class SshTimeoutError extends AppError {
  constructor(message = 'SSH timeout', { code = 'SSH_TIMEOUT', cause } = {}) {
    super(message, { statusCode: 504, code, cause })
  }
}

export class JsonReadError extends AppError {
  constructor(message = 'Failed to read JSON', { code = 'JSON_READ_ERROR', cause } = {}) {
    super(message, { statusCode: 500, code, cause })
  }
}

export class DiskWriteError extends AppError {
  constructor(message = 'Failed to write to disk', { code = 'DISK_WRITE_ERROR', cause } = {}) {
    super(message, { statusCode: 500, code, cause })
  }
}

/**
 * True if the given value is one of our AppError instances.
 */
export function isAppError(err) {
  return err instanceof AppError
}

/**
 * Convert any thrown value into a uniform error payload for HTTP responses.
 */
export function toErrorPayload(err) {
  if (err instanceof AppError) {
    return { error: err.message, code: err.statusCode }
  }
  // Unknown error: do not leak internals.
  return { error: 'Internal Server Error', code: 500 }
}
