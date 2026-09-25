import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import { Webhook, EVENT_TYPES, EMAIL_EVENTS, SUBSCRIBER_EVENTS, BROADCAST_EVENTS, SEQUENCE_EVENTS, SYSTEM_EVENTS } from '../src/webhook.ts';

const SECRET = 'whsec_test_secret';
const PAYLOAD = JSON.stringify({ type: 'email.delivered', data: { id: 1 } });

function sign(payload: string, timestamp: number, secret = SECRET): string {
  return createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('base64');
}

describe('Webhook.verify', () => {
  const now = 1_800_000_000;

  test('accepts a correctly signed payload', () => {
    const signature = `v1,${sign(PAYLOAD, now)}`;
    assert.equal(Webhook.verify(PAYLOAD, signature, String(now), SECRET, now), true);
  });

  test('rejects a payload signed with a different secret', () => {
    const signature = `v1,${sign(PAYLOAD, now, 'wrong-secret')}`;
    assert.equal(Webhook.verify(PAYLOAD, signature, String(now), SECRET, now), false);
  });

  test('rejects a tampered payload', () => {
    const signature = `v1,${sign(PAYLOAD, now)}`;
    const tampered = JSON.stringify({ type: 'email.delivered', data: { id: 999 } });
    assert.equal(Webhook.verify(tampered, signature, String(now), SECRET, now), false);
  });

  test('rejects a timestamp outside the 5 minute window', () => {
    const old = now - 301;
    const signature = `v1,${sign(PAYLOAD, old)}`;
    assert.equal(Webhook.verify(PAYLOAD, signature, String(old), SECRET, now), false);
  });

  test('accepts a timestamp at the edge of the window', () => {
    const edge = now - 300;
    const signature = `v1,${sign(PAYLOAD, edge)}`;
    assert.equal(Webhook.verify(PAYLOAD, signature, String(edge), SECRET, now), true);
  });

  test('rejects a timestamp too far in the future', () => {
    const future = now + 301;
    const signature = `v1,${sign(PAYLOAD, future)}`;
    assert.equal(Webhook.verify(PAYLOAD, signature, String(future), SECRET, now), false);
  });

  test('rejects a signature without the v1, prefix', () => {
    assert.equal(Webhook.verify(PAYLOAD, sign(PAYLOAD, now), String(now), SECRET, now), false);
  });

  test('rejects an empty signature after the prefix', () => {
    assert.equal(Webhook.verify(PAYLOAD, 'v1,', String(now), SECRET, now), false);
  });

  test('rejects null or missing arguments rather than throwing', () => {
    const signature = `v1,${sign(PAYLOAD, now)}`;
    assert.equal(Webhook.verify(null as never, signature, String(now), SECRET, now), false);
    assert.equal(Webhook.verify(PAYLOAD, null as never, String(now), SECRET, now), false);
    assert.equal(Webhook.verify(PAYLOAD, signature, null as never, SECRET, now), false);
    assert.equal(Webhook.verify(PAYLOAD, signature, String(now), null as never, now), false);
  });

  test('a signature of the wrong length is rejected without throwing', () => {
    // timingSafeEqual throws on length mismatch — the length guard must come first.
    assert.equal(Webhook.verify(PAYLOAD, 'v1,c2hvcnQ=', String(now), SECRET, now), false);
  });

  test('a non-numeric timestamp is rejected', () => {
    const signature = `v1,${sign(PAYLOAD, now)}`;
    assert.equal(Webhook.verify(PAYLOAD, signature, 'not-a-number', SECRET, now), false);
  });

  test('defaults to the current time when now is omitted', () => {
    const current = Math.floor(Date.now() / 1000);
    const signature = `v1,${sign(PAYLOAD, current)}`;
    assert.equal(Webhook.verify(PAYLOAD, signature, String(current), SECRET), true);
  });
});

describe('Webhook.computeSignature', () => {
  test('signs timestamp.payload with HMAC-SHA256, base64 encoded', () => {
    assert.equal(Webhook.computeSignature(PAYLOAD, 1_800_000_000, SECRET), sign(PAYLOAD, 1_800_000_000));
  });
});

describe('EVENT_TYPES', () => {
  test('has 34 values across five categories', () => {
    assert.equal(EMAIL_EVENTS.length, 8);
    assert.equal(SUBSCRIBER_EVENTS.length, 9);
    assert.equal(BROADCAST_EVENTS.length, 8);
    assert.equal(SEQUENCE_EVENTS.length, 7);
    assert.equal(SYSTEM_EVENTS.length, 2);
    assert.equal(EVENT_TYPES.length, 34);
  });

  test('contains no duplicates', () => {
    assert.equal(new Set(EVENT_TYPES).size, EVENT_TYPES.length);
  });

  test('matches the server-side names exactly', () => {
    assert.ok(EVENT_TYPES.includes('email.delivery_delayed'));
    assert.ok(EVENT_TYPES.includes('broadcast.partial_failure'));
    assert.ok(EVENT_TYPES.includes('sequence.subscriber_completed'));
    assert.ok(EVENT_TYPES.includes('message.attempt.exhausted'));
    assert.ok(EVENT_TYPES.includes('test.webhook'));
    assert.ok(EVENT_TYPES.includes('subscribers.purged'));
    assert.ok(EVENT_TYPES.includes('subscribers.purge_failed'));
  });
});
