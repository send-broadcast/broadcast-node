import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Inbound webhook verification.
 *
 * This is the one place the SDK reaches for node:crypto. Everything else runs
 * on the edge unchanged; only verification needs a real HMAC.
 */

export const TIMESTAMP_TOLERANCE = 300; // 5 minutes

/**
 * Every event type a webhook endpoint can subscribe to, mirroring
 * WebhookEndpoint::AVAILABLE_EVENT_TYPES server-side. Use these when creating
 * an endpoint — an unknown event type is dropped silently.
 */
export const EMAIL_EVENTS = [
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.complained',
  'email.bounced',
  'email.opened',
  'email.clicked',
  'email.failed',
] as const;

export const SUBSCRIBER_EVENTS = [
  'subscriber.created',
  'subscriber.updated',
  'subscriber.deleted',
  'subscriber.subscribed',
  'subscriber.unsubscribed',
  'subscriber.bounced',
  'subscriber.complained',
  // One event for a whole-list purge, in place of a subscriber.deleted per row
  'subscribers.purged',
  'subscribers.purge_failed',
] as const;

export const BROADCAST_EVENTS = [
  'broadcast.scheduled',
  'broadcast.queueing',
  'broadcast.sending',
  'broadcast.sent',
  'broadcast.failed',
  'broadcast.partial_failure',
  'broadcast.aborted',
  'broadcast.paused',
] as const;

export const SEQUENCE_EVENTS = [
  'sequence.subscriber_added',
  'sequence.subscriber_completed',
  'sequence.subscriber_moved',
  'sequence.subscriber_removed',
  'sequence.subscriber_paused',
  'sequence.subscriber_resumed',
  'sequence.subscriber_error',
] as const;

/** Delivery-machinery events, not content events. */
export const SYSTEM_EVENTS = ['message.attempt.exhausted', 'test.webhook'] as const;

export const EVENT_TYPES = [
  ...EMAIL_EVENTS,
  ...SUBSCRIBER_EVENTS,
  ...BROADCAST_EVENTS,
  ...SEQUENCE_EVENTS,
  ...SYSTEM_EVENTS,
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const Webhook = {
  /**
   * Verifies an inbound webhook.
   *
   * Returns false rather than throwing for every rejection — a missing header,
   * a stale timestamp, a bad signature. A handler should answer 401 for all of
   * them identically, and distinguishing them in the return type invites
   * leaking which check failed.
   *
   * @param payload the raw request body, exactly as received. Re-serialising a
   *   parsed object will change the bytes and fail verification.
   * @param now unix seconds; injectable for tests.
   */
  verify(
    payload: string,
    signatureHeader: string,
    timestampHeader: string,
    secret: string,
    now?: number,
  ): boolean {
    if (
      payload === null ||
      payload === undefined ||
      signatureHeader === null ||
      signatureHeader === undefined ||
      timestampHeader === null ||
      timestampHeader === undefined ||
      secret === null ||
      secret === undefined
    ) {
      return false;
    }

    const timestamp = Number.parseInt(String(timestampHeader), 10);
    if (Number.isNaN(timestamp)) return false;

    const currentTime = now ?? Math.floor(Date.now() / 1000);
    if (!Webhook.timestampValid(timestamp, currentTime)) return false;

    const actual = Webhook.extractSignature(signatureHeader);
    if (actual === null) return false;

    return secureCompare(Webhook.computeSignature(payload, timestamp, secret), actual);
  },

  computeSignature(payload: string, timestamp: number, secret: string): string {
    return createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('base64');
  },

  timestampValid(timestamp: number, currentTime: number = Math.floor(Date.now() / 1000)): boolean {
    return Math.abs(currentTime - timestamp) <= TIMESTAMP_TOLERANCE;
  },

  extractSignature(header: string): string | null {
    if (!header.startsWith('v1,')) return null;

    const signature = header.slice('v1,'.length);
    return signature === '' ? null : signature;
  },
};

function secureCompare(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  // timingSafeEqual throws when lengths differ, so this guard has to come
  // first. Length is not a secret; the signature length is fixed by SHA-256.
  if (left.length !== right.length) return false;

  return timingSafeEqual(left, right);
}
