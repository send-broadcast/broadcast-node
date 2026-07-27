import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Configuration } from '../src/configuration.ts';
import { Connection } from '../src/connection.ts';
import { meta } from '../src/response.ts';
import {
  APIError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
  RateLimitError,
  TimeoutError,
  ValidationError,
  WarningError,
} from '../src/errors.ts';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

interface Stub {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
  text?: string;
  throws?: Error;
}

/** Builds a fetch double that replays `stubs` in order and records every call. */
function fetchStub(stubs: Stub | Stub[]) {
  const queue = Array.isArray(stubs) ? [...stubs] : [stubs];
  const calls: Call[] = [];

  const impl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const headers: Record<string, string> = {};
    new Headers(init?.headers ?? {}).forEach((v, k) => {
      headers[k] = v;
    });
    calls.push({ url, method: init?.method ?? 'GET', headers, body: (init?.body as string) ?? null });

    const stub = queue.length > 1 ? queue.shift()! : queue[0]!;
    if (stub.throws) throw stub.throws;

    const status = stub.status ?? 200;
    const responseBody = stub.text !== undefined ? stub.text : JSON.stringify(stub.body ?? {});
    // 204/205/304 must be constructed with a null body — the Response
    // constructor throws otherwise, which would look like a transport failure.
    const nullBody = status === 204 || status === 205 || status === 304;
    return new Response(nullBody ? null : responseBody, {
      status,
      headers: stub.headers ?? { 'content-type': 'application/json' },
    });
  };

  return { impl: impl as unknown as typeof globalThis.fetch, calls };
}

function connect(stubs: Stub | Stub[], overrides: Record<string, unknown> = {}) {
  const { impl, calls } = fetchStub(stubs);
  const config = new Configuration({
    apiToken: 'test-token',
    host: 'https://mail.example.com',
    retryDelay: 0,
    maxRetryDelay: 0,
    fetch: impl,
    ...overrides,
  });
  config.validate();
  return { connection: new Connection(config), calls, config };
}

describe('Connection: request building', () => {
  test('sends bearer auth, content type, and a versioned user agent', async () => {
    const { connection, calls } = connect({ body: { ok: true } });
    await connection.request('GET', '/api/v1/whoami');

    assert.equal(calls[0]!.headers['authorization'], 'Bearer test-token');
    assert.equal(calls[0]!.headers['content-type'], 'application/json');
    assert.match(calls[0]!.headers['user-agent']!, /^broadcast-node\/\d+\.\d+\.\d+$/);
  });

  test('builds the url from host + path', async () => {
    const { connection, calls } = connect({ body: {} });
    await connection.request('GET', '/api/v1/whoami');
    assert.equal(calls[0]!.url, 'https://mail.example.com/api/v1/whoami');
  });

  test('GET params become a query string, not a body', async () => {
    const { connection, calls } = connect({ body: {} });
    await connection.request('GET', '/api/v1/subscribers.json', { page: 2, is_active: true });

    assert.match(calls[0]!.url, /\?/);
    const query = new URL(calls[0]!.url).searchParams;
    assert.equal(query.get('page'), '2');
    assert.equal(query.get('is_active'), 'true');
    assert.equal(calls[0]!.body, null);
  });

  test('array params repeat with a [] suffix', async () => {
    const { connection, calls } = connect({ body: {} });
    await connection.request('GET', '/api/v1/subscribers.json', { tags: ['a', 'b'] });

    const query = new URL(calls[0]!.url).searchParams;
    assert.deepEqual(query.getAll('tags[]'), ['a', 'b']);
  });

  test('object params flatten to key[sub]', async () => {
    const { connection, calls } = connect({ body: {} });
    await connection.request('GET', '/api/v1/subscribers.json', { custom_data: { plan: 'pro' } });

    const query = new URL(calls[0]!.url).searchParams;
    assert.equal(query.get('custom_data[plan]'), 'pro');
  });

  test('null params are dropped', async () => {
    const { connection, calls } = connect({ body: {} });
    await connection.request('GET', '/api/v1/subscribers.json', { page: 1, source: null });

    const query = new URL(calls[0]!.url).searchParams;
    assert.equal(query.has('source'), false);
    assert.equal(query.get('page'), '1');
  });

  test('an empty param object adds no query string', async () => {
    const { connection, calls } = connect({ body: {} });
    await connection.request('GET', '/api/v1/whoami', {});
    assert.equal(calls[0]!.url, 'https://mail.example.com/api/v1/whoami');
  });

  test('writes send a JSON body', async () => {
    const { connection, calls } = connect({ status: 201, body: {} });
    await connection.request('POST', '/api/v1/subscribers.json', { subscriber: { email: 'a@b.com' } });

    assert.equal(calls[0]!.method, 'POST');
    assert.deepEqual(JSON.parse(calls[0]!.body!), { subscriber: { email: 'a@b.com' } });
  });

  test('extra headers are merged, and null-valued ones skipped', async () => {
    const { connection, calls } = connect({ body: {} });
    await connection.request('POST', '/api/v1/transactionals.json', { to: 'a@b.com' }, {
      headers: { 'Idempotency-Key': 'abc', 'X-Skip': null as unknown as string },
    });

    assert.equal(calls[0]!.headers['idempotency-key'], 'abc');
    assert.equal(calls[0]!.headers['x-skip'], undefined);
  });
});

describe('Connection: responses', () => {
  test('parses a JSON body and attaches metadata', async () => {
    const { connection } = connect({ status: 201, body: { id: 7 }, headers: { 'content-type': 'application/json', 'x-ratelimit-limit': '120' } });
    const result = await connection.request('POST', '/api/v1/subscribers.json', { a: 1 });

    assert.equal(result.id, 7);
    assert.equal(meta(result).status, 201);
    assert.equal(meta(result).rateLimit!.limit, 120);
  });

  test('an empty body becomes an empty object', async () => {
    const { connection } = connect({ status: 204, text: '' });
    assert.deepEqual(await connection.request('DELETE', '/api/v1/subscribers/1'), {});
  });

  test('a 2xx that is not JSON becomes an empty object rather than throwing', async () => {
    const { connection } = connect({ status: 200, text: '<html>proxy</html>', headers: { 'content-type': 'text/html' } });
    assert.deepEqual(await connection.request('GET', '/api/v1/whoami'), {});
  });

  test('raw returns the body as text', async () => {
    const { connection } = connect({ status: 200, text: '# Skill\nUse this API.', headers: { 'content-type': 'text/plain; charset=utf-8' } });
    const result = await connection.request('GET', '/api/v1/skill', null, { raw: true });

    assert.equal(typeof result, 'string');
    assert.match(result as unknown as string, /# Skill/);
  });

  test('raw without a charset returns bytes, so binary assets survive', async () => {
    const { connection } = connect({ status: 200, text: '\x89PNG\r\n', headers: { 'content-type': 'image/png' } });
    const result = await connection.request('GET', '/api/migration/v1/file_assets/1/download', null, { raw: true });

    assert.ok(result instanceof Uint8Array, 'expected bytes for a body with no declared charset');
  });
});

describe('Connection: error mapping', () => {
  const cases: Array<[number, unknown, string]> = [
    [401, AuthenticationError, 'Authentication failed'],
    [403, AuthorizationError, 'Not authorized'],
    [404, NotFoundError, 'Resource not found'],
    [409, ConflictError, 'still being processed'],
    [422, ValidationError, 'Validation failed'],
  ];

  for (const [status, errorClass, defaultMessage] of cases) {
    test(`${status} maps to ${(errorClass as { name: string }).name} with a default message`, async () => {
      const { connection } = connect({ status, text: 'not json' });
      await assert.rejects(
        () => connection.request('GET', '/api/v1/whoami'),
        (e: Error) => {
          assert.ok(e instanceof (errorClass as new () => Error), `expected ${(errorClass as { name: string }).name}, got ${e.name}`);
          assert.match(e.message, new RegExp(defaultMessage));
          return true;
        },
      );
    });
  }

  test('prefers the API error message over the default', async () => {
    const { connection } = connect({ status: 404, body: { error: 'Subscriber not found' } });
    await assert.rejects(
      () => connection.request('GET', '/api/v1/subscribers/find.json'),
      (e: Error) => {
        assert.equal(e.message, 'Subscriber not found');
        return true;
      },
    );
  });

  test('formats an ActiveModel errors hash', async () => {
    const { connection } = connect({ status: 422, body: { errors: { email: ['is invalid', 'is taken'], name: ['is required'] } } });
    await assert.rejects(
      () => connection.request('POST', '/api/v1/subscribers.json', { a: 1 }),
      (e: Error) => {
        assert.equal(e.message, 'email is invalid, is taken; name is required');
        return true;
      },
    );
  });

  test('formats an errors array', async () => {
    const { connection } = connect({ status: 422, body: { errors: ['too short', 'too rude'] } });
    await assert.rejects(
      () => connection.request('POST', '/api/v1/subscribers.json', { a: 1 }),
      (e: Error) => {
        assert.equal(e.message, 'too short, too rude');
        return true;
      },
    );
  });

  test('429 carries Retry-After', async () => {
    const { connection } = connect({ status: 429, body: { error: 'Slow down' }, headers: { 'retry-after': '7', 'content-type': 'application/json' } }, { retryAttempts: 1 });
    await assert.rejects(
      () => connection.request('GET', '/api/v1/whoami'),
      (e: RateLimitError) => {
        assert.ok(e instanceof RateLimitError);
        assert.equal(e.retryAfter, 7);
        return true;
      },
    );
  });

  test('5xx raises APIError naming the status', async () => {
    const { connection } = connect({ status: 503, text: '' }, { retryAttempts: 1 });
    await assert.rejects(
      () => connection.request('GET', '/api/v1/whoami'),
      (e: Error) => {
        assert.ok(e instanceof APIError);
        assert.match(e.message, /Server error \(503\)/);
        return true;
      },
    );
  });

  test('an unexpected status raises APIError', async () => {
    const { connection } = connect({ status: 302, text: '', headers: {} });
    // 302 with no Location is a redirect with nothing to follow.
    await assert.rejects(() => connection.request('GET', '/api/v1/whoami'), APIError);
  });
});

describe('Connection: redirects', () => {
  test('follows a same-host GET redirect', async () => {
    const { connection, calls } = connect([
      { status: 301, text: '', headers: { location: 'https://mail.example.com/api/v1/whoami/' } },
      { status: 200, body: { ok: true } },
    ]);

    const result = await connection.request('GET', '/api/v1/whoami');
    assert.equal(result.ok, true);
    assert.equal(calls.length, 2);
    assert.equal(calls[1]!.url, 'https://mail.example.com/api/v1/whoami/');
  });

  test('resolves a relative Location', async () => {
    const { connection, calls } = connect([
      { status: 302, text: '', headers: { location: '/api/v2/whoami' } },
      { status: 200, body: { ok: true } },
    ]);

    await connection.request('GET', '/api/v1/whoami');
    assert.equal(calls[1]!.url, 'https://mail.example.com/api/v2/whoami');
  });

  test('refuses to follow a redirect to another host, because the token would go with it', async () => {
    const { connection, calls } = connect([
      { status: 301, text: '', headers: { location: 'https://evil.example.net/api/v1/whoami' } },
    ]);

    await assert.rejects(
      () => connection.request('GET', '/api/v1/whoami'),
      (e: Error) => {
        assert.ok(e instanceof APIError);
        assert.match(e.message, /different host/);
        assert.match(e.message, /carries your API token/);
        return true;
      },
    );
    assert.equal(calls.length, 1, 'must not have issued the cross-host request');
  });

  test('host comparison is case-insensitive', async () => {
    const { connection } = connect([
      { status: 301, text: '', headers: { location: 'https://MAIL.EXAMPLE.COM/api/v1/whoami' } },
      { status: 200, body: { ok: true } },
    ]);
    const result = await connection.request('GET', '/api/v1/whoami');
    assert.equal(result.ok, true);
  });

  test('never follows a redirect on a write', async () => {
    const { connection, calls } = connect([
      { status: 308, text: '', headers: { location: 'https://mail.example.com/api/v1/subscribers.json' } },
    ]);

    await assert.rejects(
      () => connection.request('POST', '/api/v1/subscribers.json', { a: 1 }),
      (e: Error) => {
        assert.match(e.message, /Host redirected POST/);
        assert.match(e.message, /writes are not followed automatically/);
        return true;
      },
    );
    assert.equal(calls.length, 1);
  });

  test('a redirect with no Location header fails clearly', async () => {
    const { connection } = connect([{ status: 301, text: '', headers: {} }]);
    await assert.rejects(
      () => connection.request('GET', '/api/v1/whoami'),
      (e: Error) => {
        assert.match(e.message, /no Location header/);
        return true;
      },
    );
  });

  test('gives up after 3 redirects', async () => {
    const { connection } = connect([
      { status: 301, text: '', headers: { location: 'https://mail.example.com/a' } },
      { status: 301, text: '', headers: { location: 'https://mail.example.com/b' } },
      { status: 301, text: '', headers: { location: 'https://mail.example.com/c' } },
      { status: 301, text: '', headers: { location: 'https://mail.example.com/d' } },
      { status: 301, text: '', headers: { location: 'https://mail.example.com/e' } },
    ]);

    await assert.rejects(
      () => connection.request('GET', '/api/v1/whoami'),
      (e: Error) => {
        assert.match(e.message, /Too many redirects \(3\)/);
        return true;
      },
    );
  });
});

describe('Connection: retries', () => {
  test('retries a 5xx and succeeds', async () => {
    const { connection, calls } = connect([
      { status: 500, text: '' },
      { status: 200, body: { ok: true } },
    ]);

    const result = await connection.request('GET', '/api/v1/whoami');
    assert.equal(result.ok, true);
    assert.equal(calls.length, 2);
  });

  test('gives up after retryAttempts', async () => {
    const { connection, calls } = connect({ status: 500, text: '' }, { retryAttempts: 3 });
    await assert.rejects(() => connection.request('GET', '/api/v1/whoami'), APIError);
    assert.equal(calls.length, 3);
  });

  test('retries a 429 and succeeds', async () => {
    const { connection, calls } = connect([
      { status: 429, text: '', headers: { 'retry-after': '0' } },
      { status: 200, body: { ok: true } },
    ]);

    const result = await connection.request('GET', '/api/v1/whoami');
    assert.equal(result.ok, true);
    assert.equal(calls.length, 2);
  });

  test('does not retry a 4xx that is not 429', async () => {
    const { connection, calls } = connect({ status: 422, body: { error: 'nope' } });
    await assert.rejects(() => connection.request('POST', '/api/v1/subscribers.json', { a: 1 }), ValidationError);
    assert.equal(calls.length, 1, '422 is deterministic — retrying it is pure latency');
  });

  test('a network failure becomes TimeoutError after exhausting retries', async () => {
    const { connection } = connect({ throws: Object.assign(new Error('fetch failed'), { name: 'TypeError' }) }, { retryAttempts: 2 });
    await assert.rejects(
      () => connection.request('GET', '/api/v1/whoami'),
      (e: Error) => {
        assert.ok(e instanceof TimeoutError || e instanceof APIError);
        return true;
      },
    );
  });

  test('an abort becomes TimeoutError', async () => {
    const abort = Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
    const { connection } = connect({ throws: abort }, { retryAttempts: 1 });
    await assert.rejects(
      () => connection.request('GET', '/api/v1/whoami'),
      (e: Error) => {
        assert.ok(e instanceof TimeoutError);
        assert.match(e.message, /Request timeout/);
        return true;
      },
    );
  });

  test('caps a long Retry-After at maxRetryDelay', async () => {
    // A server asking for an hour must not hang the caller for an hour.
    const slept: number[] = [];
    const { connection } = connect(
      [
        { status: 429, text: '', headers: { 'retry-after': '3600' } },
        { status: 200, body: { ok: true } },
      ],
      { maxRetryDelay: 50, retryDelay: 10, sleep: async (ms: number) => { slept.push(ms); } },
    );

    await connection.request('GET', '/api/v1/whoami');
    assert.deepEqual(slept, [50]);
  });
});

describe('Connection: warnings', () => {
  const warned = { body: { id: 1, warnings: [{ code: 'unrecognized_parameter', param: 'subscriber.foo', message: 'Unknown' }] } };

  test('log mode warns through the logger and still returns', async () => {
    const messages: string[] = [];
    const { connection } = connect(warned, { warningsMode: 'log', logger: { warn: (m: string) => messages.push(m) } });

    const result = await connection.request('POST', '/api/v1/subscribers.json', { a: 1 });
    assert.equal(result.id, 1);
    assert.equal(messages.length, 1);
    assert.match(messages[0]!, /unrecognized_parameter/);
  });

  test('raise mode throws WarningError carrying the response', async () => {
    const { connection } = connect(warned, { warningsMode: 'raise' });

    await assert.rejects(
      () => connection.request('POST', '/api/v1/subscribers.json', { a: 1 }),
      (e: WarningError) => {
        assert.ok(e instanceof WarningError);
        assert.equal(e.warnings.length, 1);
        assert.match(e.message, /API returned 1 warning\(s\)/);
        // The write already happened — the response must be reachable.
        assert.equal((e.response as { id: number }).id, 1);
        return true;
      },
    );
  });

  test('ignore mode is silent and leaves them on the response', async () => {
    const messages: string[] = [];
    const { connection } = connect(warned, { warningsMode: 'ignore', logger: { warn: (m: string) => messages.push(m) } });

    const result = await connection.request('POST', '/api/v1/subscribers.json', { a: 1 });
    assert.equal(messages.length, 0);
    assert.equal(meta(result).warnings.length, 1);
  });
});
