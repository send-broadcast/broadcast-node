/**
 * Response metadata.
 *
 * The Ruby gem returns `Response < Hash`, giving it two namespaces that cannot
 * collide: `result['id']` reads the body, `result.status` reads transport
 * metadata. JavaScript has no equivalent split — a `status` accessor on the
 * returned object would shadow the body's own `status` field, and Broadcast
 * returns one on every broadcast record. The API also sends a body key named
 * `warnings`, colliding with the obvious accessor name for parsed warnings.
 *
 * So the body is returned exactly as the API sent it, and metadata hangs off a
 * non-enumerable Symbol read through `meta(result)`. Object.keys(), spread, and
 * JSON.stringify() all see the untouched body.
 *
 *   const result = await client.subscribers.create({ email: 'a@b.com' });
 *   result.id                     // body
 *   meta(result).status           // 201
 *   meta(result).warnings         // parsed Warning[]
 *   meta(result).rateLimit?.remaining
 *   meta(result).idempotentReplay
 */

const META = Symbol.for('broadcast.responseMeta');

/** A single entry from the API's `warnings` array. */
export class Warning {
  readonly code: string | undefined;
  readonly param: string | null;
  readonly message: string | undefined;

  constructor(code: string | undefined, param: string | null, message: string | undefined) {
    this.code = code;
    this.param = param ?? null;
    this.message = message;
  }

  toString(): string {
    return this.param ? `[${this.code}] ${this.param}: ${this.message}` : `[${this.code}] ${this.message}`;
  }
}

/** Parsed X-RateLimit-* headers. `reset` is when the window rolls over, not a duration. */
export interface RateLimit {
  limit: number;
  remaining: number | null;
  reset: Date | null;
}

export interface ResponseMeta {
  status: number | null;
  headers: Headers | null;
  warnings: Warning[];
  hasWarnings: boolean;
  rateLimit: RateLimit | null;
  idempotentReplay: boolean;
}

const EMPTY_META: ResponseMeta = Object.freeze({
  status: null,
  headers: null,
  warnings: Object.freeze([]) as unknown as Warning[],
  hasWarnings: false,
  rateLimit: null,
  idempotentReplay: false,
});

/**
 * Reads transport metadata off a value returned by the client. Safe to call on
 * anything — a value that never passed through buildResponse reports inert
 * defaults rather than throwing, so callers need no guard.
 */
export function meta<T>(value: T): ResponseMeta {
  if (value === null || typeof value !== 'object') return EMPTY_META;
  return (value as Record<symbol, ResponseMeta>)[META] ?? EMPTY_META;
}

export function buildResponse<T>(parsed: T, status: number, headers: Headers): T {
  if (parsed === null || typeof parsed !== 'object') return parsed;

  const value: ResponseMeta = {
    status,
    headers,
    warnings: parseWarnings(parsed),
    get hasWarnings() {
      return this.warnings.length > 0;
    },
    rateLimit: parseRateLimit(headers),
    idempotentReplay: headers.get('idempotency-replayed') === 'true',
  };

  Object.defineProperty(parsed, META, { value, enumerable: false, configurable: true, writable: false });
  return parsed;
}

function parseWarnings(parsed: unknown): Warning[] {
  const raw = (parsed as Record<string, unknown>)?.['warnings'];
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((entry): entry is Record<string, unknown> => entry !== null && typeof entry === 'object' && !Array.isArray(entry))
    .map(
      (entry) =>
        new Warning(
          entry['code'] as string | undefined,
          (entry['param'] as string | null) ?? null,
          entry['message'] as string | undefined,
        ),
    );
}

function parseRateLimit(headers: Headers): RateLimit | null {
  const limit = headers.get('x-ratelimit-limit');
  if (limit === null) return null;

  const remaining = headers.get('x-ratelimit-remaining');
  return {
    limit: Number.parseInt(limit, 10),
    remaining: remaining === null ? null : Number.parseInt(remaining, 10),
    reset: parseTime(headers.get('x-ratelimit-reset')),
  };
}

function parseTime(value: string | null): Date | null {
  if (value === null) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
