import { BaseResource, compact, type Id, type Params } from './base.ts';
import type { DoubleOptInOptions } from './subscribers.ts';

export const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

export interface TransactionalCreateParams {
  /** Recipient address. */
  to: string;
  /** One of subject+body or templateId is required. */
  subject?: string;
  body?: string;
  preheader?: string;
  replyTo?: string;
  /** Resolves subject/body/preheader from a Template; subject/body override it. */
  templateId?: Id;
  includeUnsubscribeLink?: boolean;
  /** Holds the email until the recipient confirms. */
  doubleOptIn?: boolean | DoubleOptInOptions;
  confirmationTemplateId?: Id;
  /** Populates the Subscriber record on first send. */
  subscriber?: Record<string, unknown>;
  /**
   * Makes a retry safe. The server stores the response for 24 hours keyed on
   * (token, key) and replays it rather than sending a second email.
   *
   * The key is part of a fingerprint over method + full path + body:
   *   - same key, same payload, still running -> ConflictError (409)
   *   - same key, *different* payload         -> ValidationError (422)
   *
   * That 422 means "this key was already used for something else", not that the
   * email was invalid. Do not retry it with the same key.
   */
  idempotencyKey?: string;
  /** Anything else is forwarded verbatim. */
  [key: string]: unknown;
}

export class Transactionals extends BaseResource {
  // async so an invalid idempotency key rejects the returned promise rather
  // than throwing synchronously. A method that sometimes throws before it
  // returns a promise forces callers to write both try/catch and .catch().
  async create<T = any>(params: TransactionalCreateParams): Promise<T> {
    const {
      to,
      subject,
      body,
      preheader,
      replyTo,
      templateId,
      includeUnsubscribeLink,
      doubleOptIn,
      confirmationTemplateId,
      subscriber,
      idempotencyKey,
      ...extra
    } = params;

    const payload = compact({
      to,
      subject,
      body,
      preheader,
      reply_to: replyTo,
      template_id: templateId,
      include_unsubscribe_link: includeUnsubscribeLink,
      double_opt_in: doubleOptIn,
      confirmation_template_id: confirmationTemplateId,
      subscriber,
      ...extra,
    });

    return this.httpPost<T>('/api/v1/transactionals.json', payload, {
      headers: idempotencyHeaders(idempotencyKey),
    });
  }

  get<T = any>(id: Id): Promise<T> {
    return this.httpGet<T>(`/api/v1/transactionals/${id}.json`);
  }
}

function idempotencyHeaders(key: string | undefined): Record<string, string> {
  if (key === undefined || key === null) return {};

  const trimmed = String(key).trim();
  if (trimmed === '') return {};

  if (trimmed.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new RangeError(
      `idempotency_key must be ${MAX_IDEMPOTENCY_KEY_LENGTH} characters or fewer (got ${trimmed.length})`,
    );
  }

  return { 'Idempotency-Key': trimmed };
}

export type { Params };
