import { BaseResource, type Params } from './base.ts';

/**
 * The installation-wide suppression list. Addresses on it never receive mail
 * from any channel. All operations require an admin (system) API token — a
 * channel token gets a 401.
 *
 * There is deliberately no `check` here: checking is a per-channel question
 * (it reads the channel list too), so it lives on Suppressions.
 */
export class GlobalSuppressions extends BaseResource {
  /**
   * List global suppressions (250 per page, with `pagination` metadata; pass
   * `page`). Optional `email` filters by partial match.
   */
  list<T = any>(params: Params = {}): Promise<T> {
    return this.httpGet<T>('/api/v1/global_suppressions.json', params);
  }

  /** Add an address to the global list. Already-suppressed is a success (200 instead of 201). */
  add<T = any>(email: string): Promise<T> {
    return this.httpPost<T>('/api/v1/global_suppressions.json', { email });
  }

  /**
   * Remove an address from the global list only. Channels that suppressed the
   * same address on their own account keep their block.
   */
  remove<T = any>(email: string): Promise<T> {
    return this.httpDelete<T>('/api/v1/global_suppressions.json', { email });
  }

  /**
   * Add up to 10,000 addresses at once. Idempotent. Returns `added`,
   * `already_suppressed`, and `invalid` counts.
   */
  bulkAdd<T = any>(emails: string[]): Promise<T> {
    return this.httpPost<T>('/api/v1/global_suppressions/bulk.json', { emails });
  }

  /** Remove up to 10,000 addresses at once. Returns `removed` and `not_found` counts. */
  bulkRemove<T = any>(emails: string[]): Promise<T> {
    return this.httpDelete<T>('/api/v1/global_suppressions/bulk.json', { emails });
  }
}
