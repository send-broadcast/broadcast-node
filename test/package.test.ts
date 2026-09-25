import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { VERSION } from '../src/version.ts';
import * as sdk from '../src/index.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

describe('package', () => {
  // The User-Agent is built from VERSION. If it drifts from package.json,
  // server-side client attribution silently credits the wrong release.
  test('VERSION matches package.json', () => {
    assert.equal(VERSION, pkg.version);
  });

  test('ships only build output and docs', () => {
    assert.deepEqual(pkg.files, ['dist', 'README.md', 'CHANGELOG.md', 'LICENSE']);
    // Internal planning docs must not reach the published tarball.
    for (const entry of pkg.files) {
      assert.ok(!/TODO|COVERAGE|api-coverage/i.test(entry), `${entry} looks internal`);
    }
  });

  test('declares dual ESM + CJS entry points', () => {
    assert.equal(pkg.exports['.'].import, './dist/index.js');
    assert.equal(pkg.exports['.'].require, './dist/index.cjs');
    assert.equal(pkg.exports['.'].types, './dist/index.d.ts');
  });

  test('requires Node 18+, where fetch is native', () => {
    assert.match(pkg.engines.node, /18/);
  });
});

describe('public surface', () => {
  test('exports the client under both names and as default', () => {
    assert.equal(typeof sdk.Broadcast, 'function');
    assert.equal(sdk.BroadcastClient, sdk.Broadcast);
    assert.equal(sdk.default, sdk.Broadcast);
  });

  test('exports the full error hierarchy', () => {
    for (const name of [
      'BroadcastError', 'ConfigurationError', 'APIError', 'AuthenticationError',
      'AuthorizationError', 'NotFoundError', 'ConflictError', 'RateLimitError',
      'ValidationError', 'TimeoutError', 'DeliveryError', 'WarningError',
    ]) {
      assert.equal(typeof (sdk as Record<string, unknown>)[name], 'function', `missing export: ${name}`);
    }
  });

  test('error hierarchy nests the way the Ruby gem does', () => {
    assert.ok(new sdk.AuthenticationError() instanceof sdk.APIError);
    assert.ok(new sdk.ConflictError() instanceof sdk.APIError);
    assert.ok(new sdk.RateLimitError() instanceof sdk.APIError);
    // ValidationError and TimeoutError are siblings of APIError, not children.
    assert.ok(!(new sdk.ValidationError() instanceof sdk.APIError));
    assert.ok(!(new sdk.TimeoutError() instanceof sdk.APIError));
    assert.ok(new sdk.ValidationError() instanceof sdk.BroadcastError);
  });

  test('errors report their own class name', () => {
    assert.equal(new sdk.NotFoundError('x').name, 'NotFoundError');
  });

  test('exports webhook verification and the event catalogue', () => {
    assert.equal(typeof sdk.Webhook.verify, 'function');
    assert.equal(sdk.EVENT_TYPES.length, 34);
  });

  test('every resource is reachable on a constructed client', () => {
    const client = new sdk.Broadcast({ apiToken: 't', host: 'https://mail.example.com' });
    for (const name of [
      'subscribers', 'sequences', 'broadcasts', 'segments', 'templates',
      'webhookEndpoints', 'transactionals', 'optInForms', 'emailServers',
      'autopilots', 'discovery', 'migration',
    ]) {
      assert.ok((client as unknown as Record<string, unknown>)[name], `missing resource: ${name}`);
    }
  });
});
