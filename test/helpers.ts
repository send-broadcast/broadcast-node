import { Broadcast } from '../src/client.ts';

export interface RecordedCall {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  headers: Record<string, string>;
}

export interface Harness {
  client: Broadcast;
  calls: RecordedCall[];
  last(): RecordedCall;
}

/**
 * A Broadcast client whose fetch is replaced by a recorder. Assertions are made
 * against the wire — method, path, query, JSON body — rather than against
 * internal calls, so a resource method that builds the wrong URL fails here
 * even if its own signature looks right.
 */
export function harness(
  // `unknown | unknown[]` collapses to `unknown`, so the array arm said nothing.
  responses: unknown = {},
  options: Record<string, unknown> = {},
): Harness {
  const calls: RecordedCall[] = [];
  const queue = Array.isArray(responses) ? [...responses] : [responses];

  const fetchImpl = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    const headers: Record<string, string> = {};
    new Headers(init?.headers ?? {}).forEach((v, k) => {
      headers[k] = v;
    });

    calls.push({
      method: init?.method ?? 'GET',
      path: url.pathname,
      query: url.searchParams,
      body: init?.body ? JSON.parse(init.body as string) : null,
      headers,
    });

    const payload = queue.length > 1 ? queue.shift() : queue[0];
    return new Response(JSON.stringify(payload ?? {}), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const client = new Broadcast({
    apiToken: 'test-token',
    host: 'https://mail.example.com',
    retryDelay: 0,
    fetch: fetchImpl as unknown as typeof globalThis.fetch,
    ...options,
  });

  return {
    client,
    calls,
    last: () => calls[calls.length - 1]!,
  };
}
