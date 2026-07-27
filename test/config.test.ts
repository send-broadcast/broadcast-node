import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { Configuration } from '../src/configuration.ts';
import { ConfigurationError } from '../src/errors.ts';

// Mirrors broadcast-ruby's test_configuration.rb. The host rules are the ones
// that matter: 0.2.x of the Ruby gem defaulted host to https://sendbroadcast.com,
// which 301s to www and silently broke every client that did not set it. There
// is no default here, deliberately.
describe('Configuration', () => {
  const withEnv = (vars: Record<string, string | undefined>, fn: () => void) => {
    const saved: Record<string, string | undefined> = {};
    for (const key of Object.keys(vars)) {
      saved[key] = process.env[key];
      if (vars[key] === undefined) delete process.env[key];
      else process.env[key] = vars[key];
    }
    try {
      fn();
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  };

  test('defaults match the Ruby reference', () => {
    withEnv({ BROADCAST_HOST: undefined, BROADCAST_API_TOKEN: undefined }, () => {
      const config = new Configuration();
      assert.equal(config.timeout, 30_000);
      assert.equal(config.openTimeout, 10_000);
      assert.equal(config.retryAttempts, 3);
      assert.equal(config.retryDelay, 1_000);
      assert.equal(config.maxRetryDelay, 30_000);
      assert.equal(config.warningsMode, 'log');
      assert.equal(config.debug, false);
      assert.equal(config.apiToken, undefined);
      assert.equal(config.host, undefined);
      assert.equal(config.broadcastChannelId, undefined);
    });
  });

  test('reads host and token from the CLI env vars', () => {
    withEnv({ BROADCAST_HOST: 'https://mail.example.com', BROADCAST_API_TOKEN: 'env-token' }, () => {
      const config = new Configuration();
      assert.equal(config.host, 'https://mail.example.com');
      assert.equal(config.apiToken, 'env-token');
    });
  });

  test('explicit settings beat the environment', () => {
    withEnv({ BROADCAST_HOST: 'https://env.example.com', BROADCAST_API_TOKEN: 'env-token' }, () => {
      const config = new Configuration({ host: 'https://explicit.example.com', apiToken: 'explicit' });
      assert.equal(config.host, 'https://explicit.example.com');
      assert.equal(config.apiToken, 'explicit');
    });
  });

  test('requires an api token', () => {
    const config = new Configuration({ host: 'https://mail.example.com', apiToken: '' });
    assert.throws(() => config.validate(), (e: Error) => {
      assert.ok(e instanceof ConfigurationError);
      assert.match(e.message, /api_token is required/);
      return true;
    });
  });

  test('requires a host, and says how to set it', () => {
    const config = new Configuration({ apiToken: 'token', host: undefined });
    assert.throws(() => config.validate(), (e: Error) => {
      assert.ok(e instanceof ConfigurationError);
      assert.match(e.message, /host is required/);
      assert.match(e.message, /BROADCAST_HOST/);
      return true;
    });
  });

  test('strips whitespace and a trailing slash from host', () => {
    const config = new Configuration({ apiToken: 'token', host: '  https://mail.example.com/  ' });
    config.validate();
    assert.equal(config.host, 'https://mail.example.com');
  });

  test('rejects a host with no scheme', () => {
    const config = new Configuration({ apiToken: 'token', host: 'mail.example.com' });
    assert.throws(() => config.validate(), (e: Error) => {
      assert.ok(e instanceof ConfigurationError);
      assert.match(e.message, /must include a scheme/);
      return true;
    });
  });

  test('accepts http as well as https', () => {
    const config = new Configuration({ apiToken: 'token', host: 'http://localhost:3000' });
    config.validate();
    assert.equal(config.host, 'http://localhost:3000');
  });

  test('rejects an unknown warnings mode', () => {
    const config = new Configuration({
      apiToken: 'token',
      host: 'https://mail.example.com',
      warningsMode: 'explode' as never,
    });
    assert.throws(() => config.validate(), (e: Error) => {
      assert.ok(e instanceof ConfigurationError);
      assert.match(e.message, /warnings_mode must be one of/);
      return true;
    });
  });

  test('accepts each valid warnings mode', () => {
    for (const mode of ['log', 'raise', 'ignore'] as const) {
      const config = new Configuration({ apiToken: 't', host: 'https://a.com', warningsMode: mode });
      config.validate();
      assert.equal(config.warningsMode, mode);
    }
  });
});
