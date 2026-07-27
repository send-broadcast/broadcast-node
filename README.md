# @broadcast/sdk

Node/TypeScript client for [Broadcast](https://sendbroadcast.net), the email
marketing platform. Works with any Broadcast instance — self-hosted or SaaS.

Covers **104/104 API operations**, verified against the API's generated OpenAPI
document.

```bash
npm install @broadcast/sdk
```

Node 18+ (uses native `fetch`). Ships ESM and CJS builds with TypeScript types.

---

## Quick start

```ts
import { Broadcast } from '@broadcast/sdk';

const client = new Broadcast({
  apiToken: process.env.BROADCAST_API_TOKEN,
  host: 'https://mail.example.com', // required — see below
});

await client.subscribers.create({ email: 'ada@example.com', first_name: 'Ada' });

await client.transactionals.create({
  to: 'ada@example.com',
  subject: 'Welcome',
  body: '<p>Glad you are here.</p>',
});
```

CommonJS works too:

```js
const { Broadcast } = require('@broadcast/sdk');
```

### `host` is required

There is no default. Broadcast is self-hosted-first, so every instance lives at
its own domain and any built-in guess would be wrong for nearly everyone. Set it
explicitly, or via the `BROADCAST_HOST` environment variable.

`BROADCAST_HOST` and `BROADCAST_API_TOKEN` are the same names the Broadcast CLI
uses in `~/.config/broadcast/config`, so a machine set up for the CLI needs no
extra configuration.

---

## Configuration

```ts
new Broadcast({
  apiToken: '...',            // or BROADCAST_API_TOKEN
  host: 'https://...',        // or BROADCAST_HOST — required
  timeout: 30_000,            // read timeout, ms
  openTimeout: 10_000,        // connect timeout, ms
  retryAttempts: 3,
  retryDelay: 1_000,          // base backoff, ms, multiplied by attempt
  maxRetryDelay: 30_000,      // ceiling on a server-sent Retry-After
  warningsMode: 'log',        // 'log' | 'raise' | 'ignore'
  logger: console,
  debug: false,
  broadcastChannelId: 42,     // admin/system tokens
});
```

Durations are **milliseconds** here (the Ruby gem uses seconds). Wire behaviour
is identical.

---

## Reading response metadata

The API sends more than a body: warnings, rate-limit headers, and an
idempotency-replay marker. Those live behind `meta()` rather than on the object
itself:

```ts
import { meta } from '@broadcast/sdk';

const result = await client.subscribers.create({ email: 'ada@example.com' });

result.id                        // the body, exactly as the API sent it
meta(result).status              // 201
meta(result).warnings            // parsed Warning[]
meta(result).rateLimit?.remaining
meta(result).idempotentReplay    // true if the API replayed a stored response
```

**Why not `result.status`?** Because Broadcast returns a body field called
`status` (on broadcasts) and another called `warnings`. Hanging metadata off the
same object would shadow real data. The body you get back is untouched —
`Object.keys()`, spread, and `JSON.stringify()` all see exactly what the API
sent. This is the one place this SDK deliberately diverges from the Ruby gem's
ergonomics, and it is because JavaScript has no equivalent of `Response < Hash`.

---

## Warnings

A 2xx response can carry warnings: the API accepted your request but ignored
part of it — an unrecognised parameter, a value it overrode. A mistyped filter
silently widens a result set unless you look.

```ts
// 'log' (default) — warn through `logger`, return normally
// 'raise'         — throw WarningError. NOTE: the write already happened.
// 'ignore'        — say nothing; read them off meta(result)
const client = new Broadcast({ ..., warningsMode: 'raise' });
```

---

## Errors

```
BroadcastError
├── ConfigurationError
├── APIError
│   ├── AuthenticationError   401
│   ├── AuthorizationError    403
│   ├── NotFoundError         404
│   ├── ConflictError         409  idempotency replay still in flight
│   └── RateLimitError        429  carries .retryAfter
├── ValidationError           422
├── TimeoutError
├── DeliveryError
└── WarningError                   carries .warnings and .response
```

`ValidationError` and `TimeoutError` are siblings of `APIError`, not children —
matching the Ruby gem. Catching `APIError` gets you transport and status
failures and leaves validation to be handled deliberately.

Timeouts, 429s, and 5xx are retried with backoff. A 422 is not: it is
deterministic, so retrying is pure latency.

---

## Resources

### Subscribers

```ts
await client.subscribers.list({ page: 1, is_active: true, tags: ['vip'] });
await client.subscribers.find('ada@example.com');
await client.subscribers.create({ email: 'ada@example.com', tags: ['vip'] });
await client.subscribers.update('ada@example.com', { first_name: 'Ada' });
await client.subscribers.addTags('ada@example.com', ['beta']);
await client.subscribers.removeTags('ada@example.com', ['beta']);
await client.subscribers.activate('ada@example.com');
await client.subscribers.deactivate('ada@example.com');
await client.subscribers.unsubscribe('ada@example.com');
await client.subscribers.resubscribe('ada@example.com');
await client.subscribers.redact('ada@example.com');   // irreversible
```

Double opt-in on create:

```ts
await client.subscribers.create({
  email: 'ada@example.com',
  double_opt_in: { reply_to: 'hello@example.com', include_unsubscribe_link: true },
});
```

`created_after` / `created_before` that fail to parse are **ignored** by the
server rather than rejected — they come back as a `parameter_ignored` warning,
so a bad timestamp silently widens your result set. Check `meta(result).warnings`.

### Broadcasts

```ts
await client.broadcasts.list();
await client.broadcasts.get(id);
await client.broadcasts.create({ subject: 'Weekly', body: '<p>Hi</p>' });
await client.broadcasts.update(id, { subject: 'Edited' });
await client.broadcasts.delete(id);
await client.broadcasts.send(id);                     // no undo
await client.broadcasts.schedule(id, { scheduled_send_at: '2026-08-01T09:00:00Z', scheduled_timezone: 'UTC' });
await client.broadcasts.cancelSchedule(id);
await client.broadcasts.statistics(id);
await client.broadcasts.statisticsTimeline(id);
await client.broadcasts.statisticsLinks(id);
```

### Sequences

```ts
await client.sequences.list();
await client.sequences.get(id, { includeSteps: true });
await client.sequences.create({ name: 'Onboarding' });
await client.sequences.addSubscriber(id, { email: 'ada@example.com' });
await client.sequences.removeSubscriber(id, 'ada@example.com');
await client.sequences.listSubscribers(id, { page: 1 });

await client.sequences.listSteps(id);
await client.sequences.createStep(id, { subject: 'Day 1' });
await client.sequences.updateStep(id, stepId, { subject: 'Day 2' });
await client.sequences.moveStep(id, stepId, underId);
await client.sequences.deleteStep(id, stepId);
```

Steps hang off `sequences` rather than a top-level resource, matching the
nested routes.

### Segments, templates, opt-in forms

```ts
await client.segments.create({ name: 'VIPs', rules: [...] });
await client.templates.create({ label: 'Welcome', subject: 'Hi', body: '...' });
await client.optInForms.create({ label: 'Footer form' });
await client.optInForms.analytics(id, { startDate: new Date('2026-01-01') });
await client.optInForms.createVariant(id, { name: 'B', weight: 50 });
await client.optInForms.duplicate(id, { label: 'Copy' });
```

Reading a segment recounts its members server-side, so `segments.get` is not free.

### Email servers

```ts
await client.emailServers.list();
await client.emailServers.create({ name: 'SES', ... });
await client.emailServers.testConnection(id);
await client.emailServers.copyToChannel(id, targetChannelId);  // admin token
```

**Credential redaction guard.** The API returns credentials bullet-masked
(`••••••••`). A naive fetch-modify-save would write those bullets back and
destroy a working SMTP password. `update()` strips any credential field whose
value matches the redaction pattern and warns:

```ts
const server = await client.emailServers.get(id);
server.smtp_password;                                  // '••••••••'
await client.emailServers.update(id, { name: 'Renamed', smtp_password: server.smtp_password });
// -> sends only { name: 'Renamed' }, warns about the dropped field
```

Pass the real credential to rotate it, or omit the field.

### Autopilot

AI-generated newsletters. Requires `autopilot_read` / `autopilot_write`.

```ts
await client.autopilots.create({ name: 'Weekly', ai_model: 'openai/gpt-4o', ... });
await client.autopilots.activate(id);
await client.autopilots.pause(id);
await client.autopilots.triggerRun(id);      // 202 — async, poll runs()
await client.autopilots.runs(id, { limit: 10 });
```

`activate` requires an active source, an API key, and a model. Sources and tone
samples have **no API endpoints** — they are configured in the web UI, so an
autopilot created entirely over the API cannot be activated until a source is
added there.

`openrouter_api_key` is write-only and carries the same redaction guard as email
servers.

### Transactional email

```ts
await client.transactionals.create({
  to: 'ada@example.com',
  subject: 'Receipt',
  body: '<p>Thanks</p>',
  idempotencyKey: `receipt-${order.id}`,
});

await client.transactionals.get(id);
```

**Idempotency.** The server stores the response for 24 hours keyed on
(token, key) and replays it rather than sending a second email. The key is part
of a fingerprint over method + path + body:

- same key, same payload, still running → `ConflictError` (409)
- same key, **different** payload → `ValidationError` (422)

That 422 means "this key was already used for something else", not that the
email was invalid. Do not retry it with the same key.

Check `meta(result).idempotentReplay` to tell a replay from a fresh send.

This is the only endpoint that accepts `Idempotency-Key`.

### Discovery

```ts
await client.whoami();   // token identity and permissions
await client.status();   // channel readiness — check before a send
await client.prime();    // full capability manifest
await client.skill();    // plain-text agent skill manifest (a string)
```

### Migration / export

Read-only export endpoints. **Admin tokens only**, and every call needs a
`broadcast_channel_id`.

```ts
const client = new Broadcast({ ..., broadcastChannelId: 42 });

await client.migration.manifest();          // sizes the export
await client.migration.subscribers({ limit: 250 });

for await (const sub of client.migration.eachRecord('subscribers')) {
  // auto-pages; advances by the limit the server actually applied
}

const bytes = await client.migration.downloadFileAsset(id);  // Uint8Array
```

On a demo instance this entire API returns **403 for every request**, valid
token or not — deliberately, so a public demo cannot be used as a token oracle.
It surfaces here as `AuthorizationError`.

---

## Channel scoping

Admin/system tokens can address any channel:

```ts
await client.withChannel(123, async () => {
  await client.emailServers.list();   // scoped to channel 123
});
```

The override lives on the client instance and is restored afterwards, including
when the block throws. Concurrent calls on the **same** client instance will see
each other's scope — use one client per channel, or pass
`broadcast_channel_id` explicitly, when running channels in parallel.

---

## Webhooks

```ts
import { Webhook, EVENT_TYPES } from '@broadcast/sdk';

const valid = Webhook.verify(
  rawBody,                          // the raw bytes, not a re-serialised object
  req.headers['x-broadcast-signature'],
  req.headers['x-broadcast-timestamp'],
  process.env.WEBHOOK_SECRET,
);
if (!valid) return res.status(401).end();
```

HMAC-SHA256 over `timestamp.payload`, `v1,<base64>` header format, 5-minute
timestamp tolerance, constant-time comparison. `verify` returns `false` for
every rejection rather than distinguishing them — a handler should answer 401
identically in all cases.

Pass the **raw** request body. Re-serialising a parsed object changes the bytes
and verification will fail.

`EVENT_TYPES` lists all 32 event names; an unknown event type is dropped
silently when creating an endpoint.

---

## Development

```bash
npm install
npm test          # mocked HTTP, no network
npm run typecheck
npm run build

# against a real instance
BROADCAST_LIVE_TEST=1 BROADCAST_HOST=http://localhost:3000 \
BROADCAST_API_TOKEN=... npm run test:live
```

---

## License

MIT
