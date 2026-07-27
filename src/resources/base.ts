import type { Broadcast } from '../client.ts';
import type { RequestOptions } from '../connection.ts';

export type Params = Record<string, unknown>;
export type Id = string | number;

/**
 * The HTTP helpers are named httpGet/httpDelete rather than get/delete so that
 * resources can expose `get(id)` and `delete(id)` as their public API without
 * shadowing them. Naming both `get` would make an internal `this.get(path)`
 * silently resolve to the public single-record fetch.
 */
export class BaseResource {
  protected readonly client: Broadcast;

  constructor(client: Broadcast) {
    this.client = client;
  }

  protected httpGet<T = any>(path: string, params: Params = {}, options?: RequestOptions): Promise<T> {
    return this.client.request<T>('GET', path, params, options);
  }

  protected httpPost<T = any>(path: string, body: unknown = {}, options?: RequestOptions): Promise<T> {
    return this.client.request<T>('POST', path, body, options);
  }

  protected httpPatch<T = any>(path: string, body: unknown = {}, options?: RequestOptions): Promise<T> {
    return this.client.request<T>('PATCH', path, body, options);
  }

  protected httpDelete<T = any>(path: string, body: unknown = null): Promise<T> {
    return this.client.request<T>('DELETE', path, body);
  }

  /** Emits a warning through the configured logger, falling back to stderr. */
  protected warn(message: string): void {
    const logger = this.client.config.logger;
    if (logger) logger.warn(message);
    else console.warn(message);
  }
}

/** Drops undefined values so an omitted option never reaches the wire. */
export function compact(input: Params): Params {
  const result: Params = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) result[key] = value;
  }
  return result;
}
