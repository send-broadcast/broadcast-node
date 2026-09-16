# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- `client.channelDesign.get()` for `GET /api/v1/channel/design`: the token
  channel's resolved brand kit (colors, typography, layout, brand), read-only.
  Requires `templates_read`.
- `client.users`: full user management (list, get, create, update, deactivate,
  activate, delete), plus channel permissions (`channelPermissions`,
  `setChannelPermissions`, `removeChannelPermissions`,
  `bulkChannelPermissions`) and system permissions (`systemPermissions`,
  `updateSystemPermissions`). Requires an admin API token. Sudo users are
  read-only through this API, and sudo access can never be granted through it.
  `setChannelPermissions`/`bulkChannelPermissions` accept exactly one of
  `permissions`, `role`, or `presetId` and throw a `TypeError` otherwise.
- `BaseResource#httpPut`, following the existing `httpGet`/`httpPost`/
  `httpPatch`/`httpDelete` pattern, backing `setChannelPermissions`'s PUT.

## [0.1.0] - 2026-07-28

Published to npm as `@send-broadcast/sdk`. Verified from the registry: both the
ESM and CommonJS entry points load, all 18 migration methods survive bundling,
and the webhook signature is byte-identical to the Ruby, PHP and Python SDKs.

CI runs lint, typecheck and the suite on Node 22 and 24, and builds and
smoke-tests the published output on Node 18, 20, 22 and 24 — so the
`engines.node >= 18` floor is tested, not assumed.


First release. Feature parity with `broadcast-ruby` v0.3.0 — the reference
implementation — verified at **104/104 API operations** by the coverage report
in the `broadcast` repo.

### Transport
- Required explicit `host`, with `BROADCAST_HOST` / `BROADCAST_API_TOKEN` env
  fallbacks matching the Broadcast CLI's config keys
- Bearer auth, `User-Agent: broadcast-node/<version>`
- Response warnings surfaced, with `log` / `raise` / `ignore` modes
- `Idempotency-Key` request header and `Idempotency-Replayed` detection
- `X-RateLimit-*` parsing; 429 retry honouring `Retry-After`, bounded by
  `maxRetryDelay`
- Retries on timeout and 5xx with linear backoff; 422 is never retried
- Typed errors for 401/403/404/409/422/429/5xx
- Redirects followed on GET only, never across hosts — the request carries a
  bearer token and following would hand it to the redirect target
- Raw response path for `text/plain` (`/api/v1/skill`) and binary file assets
- Channel scoping via `broadcastChannelId` and `withChannel()`
- Debug logging that never emits credentials or request bodies

### Resources
Subscribers, broadcasts (incl. statistics), sequences (incl. steps), segments,
templates, opt-in forms, email servers, webhook endpoints, transactionals,
autopilot, discovery, and the 20 migration/export operations.

### Non-negotiables carried over from the Ruby gem
- **Credential redaction guard** on email servers and autopilot, so a
  fetch-modify-save cannot overwrite a real credential with bullet characters
- Webhook HMAC-SHA256 verification with a 5-minute window and constant-time
  comparison
- No credentials or subscriber emails in debug output

### Notes
- Durations are milliseconds here; the Ruby gem uses seconds.
- Response metadata is read via `meta(result)` rather than accessors on the
  returned object. Broadcast returns body fields named `status` and `warnings`,
  which accessors would shadow. See the README.
