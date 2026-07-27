import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { buildResponse, meta } from '../src/response.ts';

/**
 * The Ruby gem returns `Response < Hash`, so `result['id']` reads the body and
 * `result.status` reads transport metadata — two namespaces that cannot collide.
 *
 * JavaScript has no such split: `result.status` would shadow a body field named
 * `status`, and Broadcast really does return one (a broadcast's status is
 * 'draft' | 'sending' | 'sent'). The API also returns a body key literally named
 * `warnings`, which is exactly what the metadata accessor would be called.
 *
 * So metadata lives behind `meta(result)` instead of on the object surface. The
 * body is returned untouched: every key the API sent reads back exactly as sent,
 * and JSON.stringify round-trips without metadata leaking in.
 */
describe('buildResponse', () => {
  const headers = (h: Record<string, string> = {}) => new Headers(h);

  test('returns the parsed body untouched', () => {
    const result = buildResponse({ id: 42, email: 'a@b.com' }, 200, headers());
    assert.equal(result.id, 42);
    assert.equal(result.email, 'a@b.com');
    assert.deepEqual(Object.keys(result), ['id', 'email']);
  });

  test('body fields named status and warnings are NOT shadowed by metadata', () => {
    const result = buildResponse(
      { id: 1, status: 'draft', warnings: [{ code: 'x', param: 'y', message: 'z' }] },
      201,
      headers(),
    );

    // The body's own values, unchanged.
    assert.equal(result.status, 'draft');
    assert.deepEqual(result.warnings, [{ code: 'x', param: 'y', message: 'z' }]);

    // Transport metadata, reachable and distinct.
    assert.equal(meta(result).status, 201);
    assert.equal(meta(result).warnings.length, 1);
    assert.equal(meta(result).warnings[0]!.code, 'x');
  });

  test('metadata does not appear in JSON.stringify or Object.keys', () => {
    const result = buildResponse({ id: 1 }, 200, headers({ 'x-ratelimit-limit': '120' }));
    assert.equal(JSON.stringify(result), '{"id":1}');
    assert.deepEqual(Object.keys(result), ['id']);
  });

  test('parses the warnings array into structured entries', () => {
    const result = buildResponse(
      {
        id: 1,
        warnings: [
          { code: 'unrecognized_parameter', param: 'subscriber.foo', message: 'Unknown parameter' },
          { code: 'parameter_ignored', param: null, message: 'Ignored' },
        ],
      },
      200,
      headers(),
    );

    const w = meta(result).warnings;
    assert.equal(w.length, 2);
    assert.equal(w[0]!.code, 'unrecognized_parameter');
    assert.equal(w[0]!.param, 'subscriber.foo');
    assert.equal(String(w[0]), '[unrecognized_parameter] subscriber.foo: Unknown parameter');
    // No param -> the param segment is omitted entirely.
    assert.equal(String(w[1]), '[parameter_ignored] Ignored');
  });

  test('skips non-object entries in the warnings array', () => {
    const result = buildResponse({ warnings: ['a string', null, { code: 'ok', message: 'm' }] }, 200, headers());
    assert.equal(meta(result).warnings.length, 1);
    assert.equal(meta(result).warnings[0]!.code, 'ok');
  });

  test('hasWarnings reflects the parsed array', () => {
    assert.equal(meta(buildResponse({ id: 1 }, 200, headers())).hasWarnings, false);
    assert.equal(meta(buildResponse({ warnings: [] }, 200, headers())).hasWarnings, false);
    assert.equal(
      meta(buildResponse({ warnings: [{ code: 'a', message: 'b' }] }, 200, headers())).hasWarnings,
      true,
    );
  });

  test('parses rate limit headers', () => {
    const result = buildResponse({}, 200, headers({
      'x-ratelimit-limit': '120',
      'x-ratelimit-remaining': '118',
      'x-ratelimit-reset': '2026-07-26T12:00:00Z',
    }));

    const rl = meta(result).rateLimit!;
    assert.equal(rl.limit, 120);
    assert.equal(rl.remaining, 118);
    assert.equal(rl.reset?.toISOString(), '2026-07-26T12:00:00.000Z');
  });

  test('rate limit is null when the header is absent', () => {
    assert.equal(meta(buildResponse({}, 200, headers())).rateLimit, null);
  });

  test('an unparseable reset time becomes null rather than throwing', () => {
    const result = buildResponse({}, 200, headers({
      'x-ratelimit-limit': '120',
      'x-ratelimit-reset': 'not-a-time',
    }));
    assert.equal(meta(result).rateLimit!.reset, null);
    assert.equal(meta(result).rateLimit!.limit, 120);
  });

  test('detects an idempotent replay', () => {
    assert.equal(meta(buildResponse({}, 201, headers({ 'idempotency-replayed': 'true' }))).idempotentReplay, true);
    assert.equal(meta(buildResponse({}, 201, headers())).idempotentReplay, false);
  });

  test('header lookup is case-insensitive', () => {
    const result = buildResponse({}, 200, headers({ 'X-RateLimit-Limit': '5' }));
    assert.equal(meta(result).rateLimit!.limit, 5);
  });

  test('arrays pass through and still carry metadata', () => {
    const result = buildResponse([{ id: 1 }, { id: 2 }], 200, headers());
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 2);
    assert.equal(meta(result).status, 200);
  });

  test('meta() on a plain object that never went through buildResponse is inert, not a crash', () => {
    const m = meta({ id: 1 } as never);
    assert.equal(m.status, null);
    assert.deepEqual(m.warnings, []);
    assert.equal(m.rateLimit, null);
    assert.equal(m.idempotentReplay, false);
  });
});
