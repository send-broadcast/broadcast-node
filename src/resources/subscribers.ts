import { BaseResource, compact, type Id, type Params } from './base.ts';

export interface SubscriberListParams extends Params {
  page?: number;
  is_active?: boolean;
  source?: string;
  /** ISO-8601. An unparseable value is *ignored* by the server and returns a warning. */
  created_after?: string;
  created_before?: string;
  /** AND logic — the subscriber must carry all of them. */
  tags?: string[];
  /** Partial, case-insensitive match. Not exact. */
  email?: string;
  confirmation_status?: 'confirmed' | 'unconfirmed';
  /** JSONB containment, e.g. { plan: 'pro' }. */
  custom_data?: Record<string, unknown>;
}

export interface DoubleOptInOptions {
  reply_to?: string;
  confirmation_template_id?: Id;
  include_unsubscribe_link?: boolean;
}

export interface SubscriberCreateParams extends Params {
  email: string;
  first_name?: string;
  last_name?: string;
  is_active?: boolean;
  source?: string;
  subscribed_at?: string;
  ip_address?: string;
  tags?: string[];
  custom_data?: Record<string, unknown>;

  // Top-level options, NOT wrapped under `subscriber:`.
  double_opt_in?: boolean | DoubleOptInOptions;
  confirmation_template_id?: Id;

  /**
   * Admin tokens only — backdate the confirmation timestamp on create, for
   * migrating an already-confirmed list off another provider. Ignored with a
   * warning on update, and ignored entirely for channel-scoped tokens.
   */
  confirmed_at?: string;
}

export class Subscribers extends BaseResource {
  list<T = any>(params: SubscriberListParams = {}): Promise<T> {
    return this.httpGet<T>('/api/v1/subscribers.json', params);
  }

  find<T = any>(email: string): Promise<T> {
    return this.httpGet<T>('/api/v1/subscribers/find.json', { email });
  }

  /**
   * Create or upsert a subscriber. Attributes are wrapped under `subscriber:`,
   * except double_opt_in and confirmation_template_id, which the API expects at
   * the top level.
   *
   * `unsubscribed_at` is never settable here — use unsubscribe(email).
   */
  create<T = any>(params: SubscriberCreateParams): Promise<T> {
    const { double_opt_in, confirmation_template_id, ...attrs } = params;

    const payload: Params = { subscriber: attrs };
    if (double_opt_in !== undefined) payload['double_opt_in'] = double_opt_in;
    if (confirmation_template_id !== undefined) payload['confirmation_template_id'] = confirmation_template_id;

    return this.httpPost<T>('/api/v1/subscribers.json', payload);
  }

  update<T = any>(email: string, attrs: Params): Promise<T> {
    return this.httpPatch<T>('/api/v1/subscribers.json', { email, subscriber: attrs });
  }

  addTags<T = any>(email: string, tags: string[]): Promise<T> {
    return this.httpPost<T>('/api/v1/subscribers/add_tag.json', { email, tags });
  }

  removeTags<T = any>(email: string, tags: string[]): Promise<T> {
    return this.httpDelete<T>('/api/v1/subscribers/remove_tag.json', { email, tags });
  }

  activate<T = any>(email: string): Promise<T> {
    return this.httpPost<T>('/api/v1/subscribers/activate.json', { email });
  }

  deactivate<T = any>(email: string): Promise<T> {
    return this.httpPost<T>('/api/v1/subscribers/deactivate.json', { email });
  }

  unsubscribe<T = any>(email: string): Promise<T> {
    return this.httpPost<T>('/api/v1/subscribers/unsubscribe.json', { email });
  }

  resubscribe<T = any>(email: string): Promise<T> {
    return this.httpPost<T>('/api/v1/subscribers/resubscribe.json', { email });
  }

  /** Irreversible: scrubs personal data while keeping aggregate counts intact. */
  redact<T = any>(email: string): Promise<T> {
    return this.httpPost<T>('/api/v1/subscribers/redact.json', { email });
  }
}

export { compact };
