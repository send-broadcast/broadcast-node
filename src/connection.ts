import type { Configuration } from './configuration.ts';
import { buildResponse, meta } from './response.ts';
import { VERSION } from './version.ts';
import {
  APIError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
  RateLimitError,
  TimeoutError,
  ValidationError,
  WarningError,
} from './errors.ts';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface RequestOptions {
  headers?: Record<string, string | null | undefined>;
  /** Return the body as text/bytes instead of parsed JSON — /api/v1/skill and file downloads. */
  raw?: boolean;
}

const MAX_REDIRECTS = 3;
const REDIRECT_CODES = new Set([301, 302, 307, 308]);

type ErrorConstructor = new (message?: string) => Error;

const ERROR_MAPPING: Record<number, [ErrorConstructor, string]> = {
  401: [AuthenticationError, 'Authentication failed'],
  403: [AuthorizationError, 'Not authorized'],
  404: [NotFoundError, 'Resource not found'],
  409: [ConflictError, 'A request with this Idempotency-Key is still being processed'],
  422: [ValidationError, 'Validation failed'],
};

/**
 * HTTP transport. Owns request building, response/error mapping, retries,
 * redirects, and warning dispatch. Client stays a thin facade over this.
 */
export class Connection {
  private readonly config: Configuration;

  constructor(config: Configuration) {
    this.config = config;
  }

  async request<T = any>(
    method: HttpMethod,
    path: string,
    payload: unknown = null,
    options: RequestOptions = {},
  ): Promise<T> {
    const url = this.buildUrl(path, method, payload);
    return this.retryWithBackoff(() => this.execute<T>(method, url, payload, options, 0));
  }

  // --- Request building ----------------------------------------------------

  private buildUrl(path: string, method: HttpMethod, payload: unknown): URL {
    const url = new URL(`${this.config.host}${path}`);
    if (method === 'GET' && isNonEmptyObject(payload)) {
      for (const [key, value] of flattenParams(payload as Record<string, unknown>)) {
        url.searchParams.append(key, value);
      }
    }
    return url;
  }

  private buildHeaders(extra: Record<string, string | null | undefined> = {}): Headers {
    const headers = new Headers({
      authorization: `Bearer ${this.config.apiToken}`,
      'content-type': 'application/json',
      'user-agent': `broadcast-node/${VERSION}`,
    });
    for (const [key, value] of Object.entries(extra)) {
      if (value === null || value === undefined) continue;
      headers.set(key, String(value));
    }
    return headers;
  }

  private async execute<T>(
    method: HttpMethod,
    url: URL,
    payload: unknown,
    options: RequestOptions,
    redirects: number,
  ): Promise<T> {
    const init: RequestInit = {
      method,
      headers: this.buildHeaders(options.headers),
      // fetch follows redirects itself by default, which would send the bearer
      // token to whatever the Location points at. We handle them explicitly.
      redirect: 'manual',
    };
    if (method !== 'GET' && isNonEmptyObject(payload)) {
      init.body = JSON.stringify(payload);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeout);
    init.signal = controller.signal;

    let response: Response;
    try {
      this.debugRequest(method, url, init);
      response = await this.config.fetch(url.toString(), init);
    } catch (error) {
      throw normaliseTransportError(error);
    } finally {
      clearTimeout(timer);
    }

    this.debugResponse(response);

    if (REDIRECT_CODES.has(response.status)) {
      return this.followRedirect<T>(response, method, url, payload, options, redirects);
    }

    return this.handleResponse<T>(response, options);
  }

  // --- Redirects -----------------------------------------------------------
  //
  // A redirect nearly always means a misconfigured `host` (http vs https, a bare
  // apex that redirects to www, a stale domain). Two things are never followed:
  // writes, because replaying a send against an unexpected origin is worse than
  // failing; and anything that changes host, because every request carries
  // `Authorization: Bearer <token>` and following would hand the API token to
  // whatever the redirect points at.

  private async followRedirect<T>(
    response: Response,
    method: HttpMethod,
    url: URL,
    _payload: unknown,
    options: RequestOptions,
    redirects: number,
  ): Promise<T> {
    const location = response.headers.get('location');

    if (method !== 'GET') {
      throw new APIError(
        `Host redirected ${method} ${url.toString()} to ${location ?? '(no Location header)'}. ` +
          'Set `host` to the final URL — writes are not followed automatically.',
      );
    }
    if (location === null) {
      throw new APIError(`Redirect from ${url.toString()} had no Location header`);
    }
    if (redirects >= MAX_REDIRECTS) {
      throw new APIError(`Too many redirects (${MAX_REDIRECTS}) starting at ${url.toString()}`);
    }

    const target = new URL(location, url);
    if (target.hostname.toLowerCase() !== url.hostname.toLowerCase()) {
      throw new APIError(
        `Host redirected ${url.toString()} to a different host (${target.toString()}). Not following it — ` +
          'the request carries your API token. Set `host` to the correct instance URL.',
      );
    }

    // The query string is already baked into the current URL; don't re-append it.
    return this.execute<T>('GET', target, null, options, redirects + 1);
  }

  // --- Responses -----------------------------------------------------------

  private async handleResponse<T>(response: Response, options: RequestOptions): Promise<T> {
    if (response.status >= 200 && response.status <= 299) {
      return this.buildSuccess<T>(response, options);
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      throw new RateLimitError(
        (await parseError(response)) ?? 'Rate limit exceeded',
        retryAfter === null ? null : Number.parseInt(retryAfter, 10),
      );
    }

    const mapping = ERROR_MAPPING[response.status];
    if (mapping) {
      const [ErrorClass, fallback] = mapping;
      throw new ErrorClass((await parseError(response)) ?? fallback);
    }

    if (response.status >= 500) {
      throw new APIError((await parseError(response)) ?? `Server error (${response.status})`);
    }

    throw new APIError((await parseError(response)) ?? `Unexpected response: ${response.status}`);
  }

  private async buildSuccess<T>(response: Response, options: RequestOptions): Promise<T> {
    if (options.raw) return (await rawBody(response)) as T;

    const result = buildResponse(await parseSuccessBody(response), response.status, response.headers);
    this.handleWarnings(result);
    return result as T;
  }

  private handleWarnings(result: unknown): void {
    const warnings = meta(result).warnings;
    if (warnings.length === 0) return;

    if (this.config.warningsMode === 'raise') {
      throw new WarningError(warnings, result);
    }
    if (this.config.warningsMode === 'log') {
      for (const warning of warnings) {
        this.config.logger?.warn(`[broadcast] ${warning.toString()}`);
      }
    }
  }

  // --- Retries -------------------------------------------------------------

  private async retryWithBackoff<T>(operation: () => Promise<T>): Promise<T> {
    let attempts = 0;

    for (;;) {
      attempts += 1;
      try {
        return await operation();
      } catch (error) {
        if (attempts >= this.config.retryAttempts || !this.isRetryable(error)) throw error;
        await this.config.sleep(this.delayFor(error, attempts));
      }
    }
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof TimeoutError) return true;
    if (error instanceof RateLimitError) return true;
    // Only 5xx. A 422 is deterministic — retrying it is pure latency.
    if (error instanceof APIError && error.message.includes('Server error')) return true;
    return false;
  }

  /** Honour Retry-After, but never sleep longer than maxRetryDelay. */
  private delayFor(error: unknown, attempts: number): number {
    const base = this.config.retryDelay * attempts;
    if (error instanceof RateLimitError && error.retryAfter !== null) {
      return Math.min(error.retryAfter * 1000, this.config.maxRetryDelay);
    }
    return Math.min(base, this.config.maxRetryDelay || base);
  }

  // --- Debug logging -------------------------------------------------------

  private debugRequest(method: HttpMethod, url: URL, init: RequestInit): void {
    if (!this.config.debug) return;
    // Never log the Authorization header or the body: bodies carry subscriber
    // email addresses and credential fields.
    this.config.logger?.debug?.(`[broadcast] -> ${method} ${url.toString()} ${init.body ? '(body redacted)' : ''}`.trim());
  }

  private debugResponse(response: Response): void {
    if (!this.config.debug) return;
    this.config.logger?.debug?.(`[broadcast] <- ${response.status}`);
  }
}

// --- Helpers ---------------------------------------------------------------

function isNonEmptyObject(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0
  );
}

/** Mirrors the Ruby gem's flatten_params: arrays repeat as key[], objects as key[sub]. */
export function flattenParams(params: Record<string, unknown>): Array<[string, string]> {
  const result: Array<[string, string]> = [];

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;

    if (Array.isArray(value)) {
      for (const entry of value) result.push([`${key}[]`, stringifyParam(entry)]);
    } else if (typeof value === 'object') {
      for (const [sub, subValue] of Object.entries(value as Record<string, unknown>)) {
        result.push([`${key}[${sub}]`, stringifyParam(subValue)]);
      }
    } else {
      result.push([key, stringifyParam(value)]);
    }
  }

  return result;
}

/**
 * Stringifies a single query-parameter value.
 *
 * `String(value)` alone turns a nested object into the literal text
 * "[object Object]", which the server then stores or filters on. Only one
 * level of nesting is flattened above, so a nested object here is a caller
 * mistake — JSON is a far more diagnosable thing to see in a request log than
 * "[object Object]", and it is at least recoverable server-side.
 */
function stringifyParam(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value) ?? '';

  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- primitives only by this point
  return String(value);
}

/**
 * Raw endpoints serve two very different things: text (/api/v1/skill) and binary
 * file assets. Returning text for a PNG would corrupt it, so only decode as text
 * when the server actually declared a charset.
 */
async function rawBody(response: Response): Promise<string | Uint8Array> {
  const contentType = response.headers.get('content-type') ?? '';
  if (/charset=/i.test(contentType)) return response.text();

  return new Uint8Array(await response.arrayBuffer());
}

async function parseSuccessBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === '') return {};

  try {
    return JSON.parse(text);
  } catch {
    // A 2xx that isn't JSON (an HTML error page from a proxy, say). Surface it
    // as an empty body rather than exploding — `raw: true` is the deliberate
    // way to read non-JSON endpoints.
    return {};
  }
}

async function parseError(response: Response): Promise<string | null> {
  let body: unknown;
  try {
    body = JSON.parse(await response.text());
  } catch {
    return null;
  }
  if (body === null || typeof body !== 'object') return null;

  const record = body as Record<string, unknown>;
  if (typeof record['error'] === 'string') return record['error'];
  return formatErrors(record['errors']);
}

/** ActiveModel errors arrive as {"field": ["msg", ...]}. */
function formatErrors(errors: unknown): string | null {
  if (errors === null || errors === undefined) return null;
  if (Array.isArray(errors)) return errors.join(', ');
  if (typeof errors !== 'object') return null;

  return Object.entries(errors as Record<string, unknown>)
    .map(([field, messages]) => `${field} ${(Array.isArray(messages) ? messages : [messages]).join(', ')}`)
    .join('; ');
}

function normaliseTransportError(error: unknown): Error {
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return new TimeoutError(`Request timeout: ${error.message}`);
    }
    // fetch surfaces DNS/TCP/TLS failures as `TypeError: fetch failed` with the
    // real reason on `cause`. Those are transient enough to retry, and
    // TimeoutError is the class the retry loop already honours.
    //
    // Narrowly, though: a TypeError with no cause is usually our bug or a bad
    // argument (an invalid URL, a malformed header). Reporting that as
    // "Request timeout" sends people to debug their network instead of their
    // call, so it surfaces as itself.
    if (error.name === 'TypeError' && (error.cause !== undefined || /fetch failed|network/i.test(error.message))) {
      const cause = error.cause instanceof Error ? `: ${error.cause.message}` : '';
      return new TimeoutError(`Request timeout: ${error.message}${cause}`);
    }
    return error;
  }
  return new APIError(String(error));
}
