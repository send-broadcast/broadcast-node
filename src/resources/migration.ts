import { BaseResource, type Id, type Params } from './base.ts';

/**
 * Read-only export endpoints under /api/migration/v1 — the surface behind
 * backups and instance-to-instance migration.
 *
 * Two things differ from the v1 API:
 *
 * 1. **Admin tokens only.** Channel-scoped tokens are rejected outright.
 * 2. **broadcast_channel_id is required on every call.** Set it once via
 *    `new Broadcast({ broadcastChannelId })` or `client.withChannel(id)` and it
 *    is attached automatically; otherwise pass it per call.
 *
 * On a demo instance (`DEMO_MODE`) this entire API returns 403 for every
 * request, valid token or not, so the demo cannot be used as a token oracle.
 * That surfaces here as AuthorizationError.
 *
 * Every list endpoint pages with limit (1..250, default 250) and offset, and
 * returns { data: [...], pagination: {...} }.
 */

/** Endpoints that are a plain paginated list of the channel's records. */
export const COLLECTIONS = {
  channels: 'channels',
  subscribers: 'subscribers',
  templates: 'templates',
  segments: 'segments',
  sequences: 'sequences',
  emailServers: 'email_servers',
  optInForms: 'opt_in_forms',
  broadcasts: 'broadcasts',
  outboundReceipts: 'outbound_receipts',
  webhookEndpoints: 'webhook_endpoints',
  tokens: 'tokens',
  suppressions: 'suppressions',
  tags: 'tags',
  users: 'users',
  linkRedirects: 'link_redirects',
  linkClicks: 'link_clicks',
  subscriberHistories: 'subscriber_histories',
  fileAssets: 'file_assets',
} as const;

export type CollectionName = keyof typeof COLLECTIONS;

export interface PageParams extends Params {
  limit?: number;
  offset?: number;
}

export class Migration extends BaseResource {
  /**
   * Export summary: format version, channel identity, per-resource counts, and
   * recent-history totals. Call this first to size an export.
   *
   * `days_history` windows the time-bounded counts; the server clamps to 1..365.
   */
  manifest<T = any>(params: Params = {}): Promise<T> {
    return this.httpGet<T>('/api/migration/v1/manifest', params);
  }

  /** Binary contents of a stored file asset — bytes, not JSON. */
  downloadFileAsset(id: Id, params: Params = {}): Promise<Uint8Array> {
    // Verb and path stay on one line: the coverage scanner is line-based, and
    // splitting them across lines makes this endpoint read as unimplemented.
    return this.client.request<Uint8Array>('GET', `/api/migration/v1/file_assets/${id}/download`, params, { raw: true });
  }

  /**
   * Pages through a collection, yielding each record.
   *
   *   for await (const sub of client.migration.eachRecord('subscribers')) { ... }
   *
   * Stops when the server reports has_more: false, and advances by the limit the
   * server actually applied rather than the one requested — the server clamps to
   * 250, so trusting the request would skip records.
   */
  async *eachRecord(
    collection: CollectionName,
    params: PageParams = {},
  ): AsyncGenerator<unknown, void, undefined> {
    const { limit = 250, ...rest } = params;
    let offset = 0;

    for (;;) {
      const page = await this[collection]({ ...rest, limit, offset });
      const records: unknown[] = Array.isArray(page?.data) ? page.data : [];

      for (const record of records) yield record;

      const pagination = page?.pagination ?? {};
      if (!pagination.has_more) return;

      const advanced = Number(pagination.limit ?? records.length);
      if (!Number.isFinite(advanced) || advanced <= 0) return;

      offset += advanced;
    }
  }

}

/**
 * The 18 collection methods are generated onto the prototype below. They are
 * declared through interface merging rather than as class fields on purpose:
 * a class field declaration compiles to an own property initialised to
 * undefined, which would shadow the generated prototype method and make every
 * collection call fail with "is not a function".
 */
export interface Migration extends Record<CollectionName, (params?: PageParams) => Promise<any>> {}

for (const [method, path] of Object.entries(COLLECTIONS)) {
  Object.defineProperty(Migration.prototype, method, {
    value: function (this: Migration, params: PageParams = {}) {
      // Reaches through the protected helper deliberately: these methods are
      // generated, so they cannot call this.httpGet from inside the class body.
      return (this as unknown as { httpGet: (p: string, q: Params) => Promise<any> }).httpGet(
        `/api/migration/v1/${path}`,
        params,
      );
    },
    writable: true,
    enumerable: false,
    configurable: true,
  });
}
