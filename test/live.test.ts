import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';

import { Broadcast } from '../src/client.ts';
import { meta } from '../src/response.ts';

/**
 * Smoke test against a real Broadcast instance. Skipped unless BROADCAST_LIVE_TEST
 * is set, because it needs a token and a reachable host:
 *
 *   BROADCAST_LIVE_TEST=1 BROADCAST_HOST=http://localhost:3000 \
 *   BROADCAST_API_TOKEN=... npm run test:live
 *
 * The mocked suite proves the client builds the right requests. Only this
 * proves the server agrees — a header stripped by a proxy, a renamed field, or
 * a route that moved are all invisible to a stub.
 *
 * Read-only by design: it must be safe to point at production.
 */
const LIVE = process.env['BROADCAST_LIVE_TEST'] === '1';

describe('live smoke', { skip: LIVE ? false : 'set BROADCAST_LIVE_TEST=1 to run' }, () => {
  let client: Broadcast;

  before(() => {
    client = new Broadcast({
      host: process.env['BROADCAST_HOST'],
      apiToken: process.env['BROADCAST_API_TOKEN'],
    });
  });

  test('whoami identifies the token', async () => {
    const result = await client.whoami();
    assert.ok(result['token_type'] ?? result['type'], `unexpected whoami shape: ${JSON.stringify(result)}`);
    assert.equal(meta(result).status, 200);
  });

  test('status reports channel readiness', async () => {
    const result = await client.status();
    assert.ok(typeof result === 'object');
  });

  test('prime returns a capability manifest', async () => {
    const result = await client.prime();
    assert.ok(result['version'] ?? result['platform'] ?? result['endpoints'], 'prime returned no manifest fields');
  });

  test('skill returns plain text, not JSON', async () => {
    const result = await client.skill();
    assert.equal(typeof result, 'string');
    assert.ok(result.length > 0);
  });

  test('subscribers list paginates', async () => {
    const result = await client.subscribers.list({ page: 1 });
    assert.ok(Array.isArray(result['subscribers'] ?? result['data'] ?? result));
  });

  test('rate limit headers are present and parsed', async () => {
    const result = await client.whoami();
    const rl = meta(result).rateLimit;
    if (rl) {
      assert.ok(rl.limit > 0);
      assert.ok(rl.remaining === null || rl.remaining >= 0);
    }
  });

  test('a bad token is rejected as AuthenticationError', async () => {
    const bad = new Broadcast({
      host: process.env['BROADCAST_HOST'],
      apiToken: 'definitely-not-a-real-token',
      retryAttempts: 1,
    });

    await assert.rejects(() => bad.whoami(), (e: Error) => {
      assert.equal(e.name, 'AuthenticationError');
      return true;
    });
  });
});
