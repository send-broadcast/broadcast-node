/**
 * Error hierarchy, mirroring broadcast-ruby's lib/broadcast/errors.rb.
 *
 * Note the shape: ValidationError and TimeoutError descend from BroadcastError,
 * NOT from APIError. That is deliberate and matches the Ruby gem — `catch`ing
 * APIError gets you transport and status failures, and leaves validation for
 * the caller to handle explicitly.
 */

export class BroadcastError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = new.target.name;
    // Keeps `instanceof` working when the package is consumed as CJS from a
    // transpiled ES5 target, where extending built-ins otherwise breaks it.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ConfigurationError extends BroadcastError {}

export class APIError extends BroadcastError {}

export class AuthenticationError extends APIError {}

export class AuthorizationError extends APIError {}

export class NotFoundError extends APIError {}

/**
 * 409 — an in-flight request is already using this Idempotency-Key. The
 * original request is still processing; retrying after a short pause will
 * either replay its stored response or run fresh if it failed.
 */
export class ConflictError extends APIError {}

export class RateLimitError extends APIError {
  /** Seconds the server asked us to wait, parsed from the Retry-After header. */
  readonly retryAfter: number | null;

  constructor(message?: string, retryAfter: number | null = null) {
    super(message);
    this.retryAfter = retryAfter;
  }
}

export class ValidationError extends BroadcastError {}

export class TimeoutError extends BroadcastError {}

export class DeliveryError extends BroadcastError {}

export interface WarningLike {
  code?: string;
  param?: string | null;
  message?: string;
  toString(): string;
}

/**
 * Thrown instead of returning when warningsMode is 'raise' and a 2xx response
 * carried warnings. The request DID succeed — the write happened. Callers
 * catching this must not assume anything was rolled back.
 */
export class WarningError extends BroadcastError {
  readonly warnings: WarningLike[];
  readonly response: unknown;

  constructor(warnings: WarningLike[], response: unknown = null) {
    super(`API returned ${warnings.length} warning(s): ${warnings.map((w) => String(w)).join('; ')}`);
    this.warnings = warnings;
    this.response = response;
  }
}
