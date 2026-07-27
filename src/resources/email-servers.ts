import { BaseResource, compact, type Id, type Params } from './base.ts';

/**
 * Fields the API returns bullet-masked. Round-tripping one of these from a
 * fetch into an update would replace a working credential with bullets, so
 * update() strips them. This is a data-loss guard, not a nicety.
 */
export const REDACTED_FIELDS = [
  'smtp_password',
  'aws_access_key_id',
  'aws_secret_access_key',
  'outbound_aws_access_key_id',
  'outbound_aws_secret_access_key',
  'postmark_api_token',
  'inboxroad_api_token',
  'smtp_com_api_key',
] as const;

/** Matches the API's redaction shape: 8 bullets, or a 4-char prefix + bullets + 4-char suffix. */
const REDACTED_PATTERN = /^(?:•{8}|.{0,4}•+.{0,4})$/;

export class EmailServers extends BaseResource {
  list<T = any>(params: { limit?: number; offset?: number } = {}): Promise<T> {
    return this.httpGet<T>('/api/v1/email_servers', compact({ limit: params.limit, offset: params.offset }));
  }

  get<T = any>(id: Id): Promise<T> {
    return this.httpGet<T>(`/api/v1/email_servers/${id}`);
  }

  create<T = any>(attrs: Params): Promise<T> {
    return this.httpPost<T>('/api/v1/email_servers', { email_server: attrs });
  }

  /**
   * CAUTION: API responses redact credential fields with bullet characters.
   * Never echo a fetched response back into update — this method scrubs values
   * matching the redaction pattern, but you should pass only the fields you
   * actually want to change.
   */
  update<T = any>(id: Id, attrs: Params): Promise<T> {
    return this.httpPatch<T>(`/api/v1/email_servers/${id}`, { email_server: this.scrubRedacted(attrs) });
  }

  delete<T = any>(id: Id): Promise<T> {
    return this.httpDelete<T>(`/api/v1/email_servers/${id}`);
  }

  testConnection<T = any>(id: Id): Promise<T> {
    return this.httpPost<T>(`/api/v1/email_servers/${id}/test_connection`);
  }

  /**
   * Requires an admin/system token. In SaaS mode the target channel is scoped
   * to the token creator's account.
   */
  copyToChannel<T = any>(id: Id, targetChannelId: Id): Promise<T> {
    return this.httpPost<T>(`/api/v1/email_servers/${id}/copy_to_channel`, { target_channel_id: targetChannelId });
  }

  private scrubRedacted(attrs: Params): Params {
    const scrubbed: Params = {};

    for (const [key, value] of Object.entries(attrs)) {
      if (isRedacted(key, value)) {
        this.warn(
          `[broadcast-node] Dropped redacted ${key} from update payload — ` +
            'pass the real credential or omit the field',
        );
        continue;
      }
      scrubbed[key] = value;
    }

    return scrubbed;
  }
}

function isRedacted(key: string, value: unknown): boolean {
  return (
    (REDACTED_FIELDS as readonly string[]).includes(key) &&
    typeof value === 'string' &&
    REDACTED_PATTERN.test(value)
  );
}
