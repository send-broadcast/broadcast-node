/**
 * Verifies the *built* package on whatever Node is running it.
 *
 * The test suite runs TypeScript directly through --experimental-strip-types,
 * which needs Node 22.6+. package.json claims `engines.node >= 18`, and that
 * claim is about the compiled output in dist/, not about the sources. Without
 * this script the floor would be advertised and never exercised: CI would only
 * ever prove the SDK works on the Node version that can run its tests.
 *
 * No network. Everything here is local construction and pure functions.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const failures = [];
function check(name, fn) {
  try {
    fn();
    console.log(`  ok    ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.log(`  FAIL  ${name} — ${error.message}`);
  }
}

console.log(`smoke: node ${process.version}`);

// --- ESM -------------------------------------------------------------------

const esm = await import('../dist/index.js');

check('ESM: named export', () => assert.equal(typeof esm.Broadcast, 'function'));
check('ESM: default export matches', () => assert.equal(esm.default, esm.Broadcast));
check('ESM: client constructs', () => {
  const client = new esm.Broadcast({ apiToken: 't', host: 'https://mail.example.com' });
  assert.equal(typeof client.subscribers.list, 'function');
});
check('ESM: metaprogrammed migration methods survive bundling', () => {
  const client = new esm.Broadcast({ apiToken: 't', host: 'https://mail.example.com' });
  for (const name of Object.keys(esm.COLLECTIONS)) {
    assert.equal(typeof client.migration[name], 'function', `missing ${name}`);
  }
  assert.equal(Object.keys(esm.COLLECTIONS).length, 18);
});
check('ESM: 32 event types', () => assert.equal(esm.EVENT_TYPES.length, 32));
check('ESM: webhook signature matches the other SDKs', () => {
  // The same vector the Ruby, PHP and Python suites use.
  const expected = 'y19yI03OyA91nDvr3AtwDvmLYUUjpJ4WSjQFk7PYAqc=';
  const payload = JSON.stringify({ type: 'email.delivered', data: { id: 1 } });
  assert.equal(esm.Webhook.computeSignature(payload, 1_800_000_000, 'whsec_test_secret'), expected);
});
check('ESM: error hierarchy', () => {
  assert.ok(new esm.AuthenticationError() instanceof esm.APIError);
  assert.ok(!(new esm.ValidationError() instanceof esm.APIError));
});
check('ESM: host is required', () => {
  assert.throws(() => new esm.Broadcast({ apiToken: 't', host: '' }), /host is required/);
});

// --- CJS -------------------------------------------------------------------

const cjs = require('../dist/index.cjs');

check('CJS: named export', () => assert.equal(typeof cjs.Broadcast, 'function'));
check('CJS: client constructs', () => {
  const client = new cjs.Broadcast({ apiToken: 't', host: 'https://mail.example.com' });
  assert.equal(typeof client.autopilots.triggerRun, 'function');
});
check('CJS: migration methods present', () => {
  const client = new cjs.Broadcast({ apiToken: 't', host: 'https://mail.example.com' });
  assert.equal(typeof client.migration.subscribers, 'function');
});
check('CJS: 32 event types', () => assert.equal(cjs.EVENT_TYPES.length, 32));

// --- Types -----------------------------------------------------------------

check('type declarations are emitted', () => {
  assert.ok(require('node:fs').existsSync(new URL('../dist/index.d.ts', import.meta.url)));
});

if (failures.length > 0) {
  console.error(`\n${failures.length} smoke failure(s) on node ${process.version}`);
  process.exit(1);
}

console.log(`\nall smoke checks passed on node ${process.version}`);
