import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { harness } from './helpers.ts';

/**
 * Wire-shape parity with broadcast-ruby, operation by operation.
 *
 * Every assertion is method + path + body, because those are what the API sees.
 * The .json suffixes on subscribers/segments/transactionals are not cosmetic —
 * they are what the Ruby gem sends, and the coverage report matches on path.
 */

describe('Discovery', () => {
  test('whoami, status, prime', async () => {
    const h = harness();
    await h.client.discovery.whoami();
    assert.deepEqual([h.last().method, h.last().path], ['GET', '/api/v1/whoami']);

    await h.client.discovery.status();
    assert.equal(h.last().path, '/api/v1/status');

    await h.client.discovery.prime();
    assert.equal(h.last().path, '/api/v1/prime');
  });

  test('skill is a raw text endpoint returning a string', async () => {
    const calls: string[] = [];
    const fetchImpl = async (input: string | URL) => {
      calls.push(input.toString());
      return new Response('# Broadcast skill', { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    };
    const { Broadcast } = await import('../src/client.ts');
    const client = new Broadcast({
      apiToken: 't',
      host: 'https://mail.example.com',
      fetch: fetchImpl as unknown as typeof globalThis.fetch,
    });

    const result = await client.discovery.skill();
    assert.equal(typeof result, 'string');
    assert.match(result, /Broadcast skill/);
    assert.match(calls[0]!, /\/api\/v1\/skill$/);
  });

  test('client-level convenience shims delegate to discovery', async () => {
    const h = harness();
    await h.client.whoami();
    assert.equal(h.last().path, '/api/v1/whoami');
    await h.client.status();
    assert.equal(h.last().path, '/api/v1/status');
    await h.client.prime();
    assert.equal(h.last().path, '/api/v1/prime');
  });
});

describe('Subscribers', () => {
  test('list hits the .json path and passes filters as query params', async () => {
    const h = harness();
    await h.client.subscribers.list({ page: 2, is_active: true, tags: ['vip', 'beta'] });

    assert.equal(h.last().method, 'GET');
    assert.equal(h.last().path, '/api/v1/subscribers.json');
    assert.equal(h.last().query.get('page'), '2');
    assert.equal(h.last().query.get('is_active'), 'true');
    assert.deepEqual(h.last().query.getAll('tags[]'), ['vip', 'beta']);
  });

  test('find', async () => {
    const h = harness();
    await h.client.subscribers.find('a@b.com');
    assert.equal(h.last().path, '/api/v1/subscribers/find.json');
    assert.equal(h.last().query.get('email'), 'a@b.com');
  });

  test('create wraps attributes under subscriber', async () => {
    const h = harness();
    await h.client.subscribers.create({ email: 'a@b.com', first_name: 'Ada', tags: ['vip'] });

    assert.equal(h.last().method, 'POST');
    assert.equal(h.last().path, '/api/v1/subscribers.json');
    assert.deepEqual(h.last().body, { subscriber: { email: 'a@b.com', first_name: 'Ada', tags: ['vip'] } });
  });

  test('create lifts double_opt_in and confirmation_template_id to the top level', async () => {
    const h = harness();
    await h.client.subscribers.create({
      email: 'a@b.com',
      double_opt_in: true,
      confirmation_template_id: 7,
    });

    assert.deepEqual(h.last().body, {
      subscriber: { email: 'a@b.com' },
      double_opt_in: true,
      confirmation_template_id: 7,
    });
  });

  test('create accepts an object form of double_opt_in', async () => {
    const h = harness();
    await h.client.subscribers.create({
      email: 'a@b.com',
      double_opt_in: { reply_to: 'hi@b.com', include_unsubscribe_link: false },
    });

    assert.deepEqual((h.last().body as Record<string, unknown>)['double_opt_in'], {
      reply_to: 'hi@b.com',
      include_unsubscribe_link: false,
    });
  });

  test('update sends email at the top level and the rest under subscriber', async () => {
    const h = harness();
    await h.client.subscribers.update('a@b.com', { first_name: 'Grace' });

    assert.equal(h.last().method, 'PATCH');
    assert.equal(h.last().path, '/api/v1/subscribers.json');
    assert.deepEqual(h.last().body, { email: 'a@b.com', subscriber: { first_name: 'Grace' } });
  });

  test('tag operations', async () => {
    const h = harness();
    await h.client.subscribers.addTags('a@b.com', ['vip']);
    assert.deepEqual([h.last().method, h.last().path], ['POST', '/api/v1/subscribers/add_tag.json']);
    assert.deepEqual(h.last().body, { email: 'a@b.com', tags: ['vip'] });

    await h.client.subscribers.removeTags('a@b.com', ['vip']);
    assert.deepEqual([h.last().method, h.last().path], ['DELETE', '/api/v1/subscribers/remove_tag.json']);
    assert.deepEqual(h.last().body, { email: 'a@b.com', tags: ['vip'] });
  });

  test('lifecycle actions all post the email', async () => {
    const h = harness();
    const actions = ['activate', 'deactivate', 'unsubscribe', 'resubscribe', 'redact'] as const;

    for (const action of actions) {
      await h.client.subscribers[action]('a@b.com');
      assert.equal(h.last().method, 'POST', action);
      assert.equal(h.last().path, `/api/v1/subscribers/${action}.json`);
      assert.deepEqual(h.last().body, { email: 'a@b.com' });
    }
  });
});

describe('Broadcasts', () => {
  test('CRUD sends attributes unwrapped', async () => {
    const h = harness();
    await h.client.broadcasts.list({ page: 1 });
    assert.deepEqual([h.last().method, h.last().path], ['GET', '/api/v1/broadcasts']);

    await h.client.broadcasts.get(5);
    assert.equal(h.last().path, '/api/v1/broadcasts/5');

    await h.client.broadcasts.create({ subject: 'Hello' });
    assert.deepEqual([h.last().method, h.last().path], ['POST', '/api/v1/broadcasts']);
    assert.deepEqual(h.last().body, { subject: 'Hello' });

    await h.client.broadcasts.update(5, { subject: 'Edited' });
    assert.deepEqual([h.last().method, h.last().path], ['PATCH', '/api/v1/broadcasts/5']);
    assert.deepEqual(h.last().body, { subject: 'Edited' });

    await h.client.broadcasts.delete(5);
    assert.deepEqual([h.last().method, h.last().path], ['DELETE', '/api/v1/broadcasts/5']);
  });

  test('send, schedule, cancel', async () => {
    const h = harness();
    await h.client.broadcasts.send(5);
    assert.deepEqual([h.last().method, h.last().path], ['POST', '/api/v1/broadcasts/5/send_broadcast']);

    await h.client.broadcasts.schedule(5, { scheduled_send_at: '2026-08-01T09:00:00Z', scheduled_timezone: 'UTC' });
    assert.equal(h.last().path, '/api/v1/broadcasts/5/schedule_broadcast');
    assert.deepEqual(h.last().body, { scheduled_send_at: '2026-08-01T09:00:00Z', scheduled_timezone: 'UTC' });

    await h.client.broadcasts.cancelSchedule(5);
    assert.equal(h.last().path, '/api/v1/broadcasts/5/cancel_schedule');
  });

  test('statistics endpoints', async () => {
    const h = harness();
    await h.client.broadcasts.statistics(5);
    assert.equal(h.last().path, '/api/v1/broadcasts/5/statistics');

    await h.client.broadcasts.statisticsTimeline(5, { interval: 'hour' });
    assert.equal(h.last().path, '/api/v1/broadcasts/5/statistics/timeline');
    assert.equal(h.last().query.get('interval'), 'hour');

    await h.client.broadcasts.statisticsLinks(5);
    assert.equal(h.last().path, '/api/v1/broadcasts/5/statistics/links');
  });
});

describe('Sequences', () => {
  test('CRUD', async () => {
    const h = harness();
    await h.client.sequences.list();
    assert.deepEqual([h.last().method, h.last().path], ['GET', '/api/v1/sequences']);

    await h.client.sequences.get(3);
    assert.equal(h.last().path, '/api/v1/sequences/3');
    assert.equal(h.last().query.has('include_steps'), false);

    await h.client.sequences.get(3, { includeSteps: true });
    assert.equal(h.last().query.get('include_steps'), 'true');

    await h.client.sequences.create({ name: 'Onboarding' });
    assert.deepEqual([h.last().method, h.last().path], ['POST', '/api/v1/sequences']);
    assert.deepEqual(h.last().body, { name: 'Onboarding' });

    await h.client.sequences.update(3, { name: 'Renamed' });
    assert.deepEqual([h.last().method, h.last().path], ['PATCH', '/api/v1/sequences/3']);

    await h.client.sequences.delete(3);
    assert.equal(h.last().method, 'DELETE');
  });

  test('subscriber enrollment', async () => {
    const h = harness();
    await h.client.sequences.addSubscriber(3, { email: 'a@b.com' });
    assert.deepEqual([h.last().method, h.last().path], ['POST', '/api/v1/sequences/3/add_subscriber']);
    assert.deepEqual(h.last().body, { email: 'a@b.com' });

    await h.client.sequences.removeSubscriber(3, 'a@b.com');
    assert.deepEqual([h.last().method, h.last().path], ['DELETE', '/api/v1/sequences/3/remove_subscriber']);
    assert.deepEqual(h.last().body, { email: 'a@b.com' });

    await h.client.sequences.listSubscribers(3, { page: 2 });
    assert.equal(h.last().path, '/api/v1/sequences/3/list_subscribers');
    assert.equal(h.last().query.get('page'), '2');
  });

  test('steps', async () => {
    const h = harness();
    await h.client.sequences.listSteps(3);
    assert.deepEqual([h.last().method, h.last().path], ['GET', '/api/v1/sequences/3/steps']);

    await h.client.sequences.getStep(3, 9);
    assert.equal(h.last().path, '/api/v1/sequences/3/steps/9');

    await h.client.sequences.createStep(3, { subject: 'Day 1' });
    assert.deepEqual([h.last().method, h.last().path], ['POST', '/api/v1/sequences/3/steps']);

    await h.client.sequences.updateStep(3, 9, { subject: 'Day 2' });
    assert.deepEqual([h.last().method, h.last().path], ['PATCH', '/api/v1/sequences/3/steps/9']);

    await h.client.sequences.moveStep(3, 9, 4);
    assert.deepEqual([h.last().method, h.last().path], ['POST', '/api/v1/sequences/3/steps/9/move']);
    assert.deepEqual(h.last().body, { under_id: 4 });

    await h.client.sequences.deleteStep(3, 9);
    assert.deepEqual([h.last().method, h.last().path], ['DELETE', '/api/v1/sequences/3/steps/9']);
  });
});

describe('Segments', () => {
  test('list and get use .json, writes wrap under segment', async () => {
    const h = harness();
    await h.client.segments.list();
    assert.equal(h.last().path, '/api/v1/segments.json');

    await h.client.segments.get(2);
    assert.equal(h.last().path, '/api/v1/segments/2.json');

    await h.client.segments.get(2, { page: 3 });
    assert.equal(h.last().query.get('page'), '3');

    await h.client.segments.create({ name: 'VIPs' });
    assert.deepEqual([h.last().method, h.last().path], ['POST', '/api/v1/segments']);
    assert.deepEqual(h.last().body, { segment: { name: 'VIPs' } });

    await h.client.segments.update(2, { name: 'Renamed' });
    assert.deepEqual([h.last().method, h.last().path], ['PATCH', '/api/v1/segments/2']);
    assert.deepEqual(h.last().body, { segment: { name: 'Renamed' } });

    await h.client.segments.delete(2);
    assert.deepEqual([h.last().method, h.last().path], ['DELETE', '/api/v1/segments/2']);
  });
});

describe('Templates', () => {
  test('CRUD wraps under template', async () => {
    const h = harness();
    await h.client.templates.list();
    assert.equal(h.last().path, '/api/v1/templates');

    await h.client.templates.get(4);
    assert.equal(h.last().path, '/api/v1/templates/4');

    await h.client.templates.create({ label: 'Welcome', subject: 'Hi' });
    assert.deepEqual(h.last().body, { template: { label: 'Welcome', subject: 'Hi' } });

    await h.client.templates.update(4, { template_purpose: 'confirmation' });
    assert.deepEqual(h.last().body, { template: { template_purpose: 'confirmation' } });

    await h.client.templates.delete(4);
    assert.equal(h.last().method, 'DELETE');
  });

  test('passes confirmation_page_settings through verbatim', async () => {
    const h = harness();
    const settings = { confirmed: { heading: "You're in", body: 'Thanks.' } };
    await h.client.templates.create({ label: 'C', confirmation_page_settings: settings });

    assert.deepEqual(
      ((h.last().body as Record<string, Record<string, unknown>>)['template'])!['confirmation_page_settings'],
      settings,
    );
  });
});

describe('Opt-in forms', () => {
  test('CRUD wraps under opt_in_form', async () => {
    const h = harness();
    await h.client.optInForms.list({ enabled: 'true' });
    assert.equal(h.last().path, '/api/v1/opt_in_forms');
    assert.equal(h.last().query.get('enabled'), 'true');

    await h.client.optInForms.get(6);
    assert.equal(h.last().path, '/api/v1/opt_in_forms/6');

    await h.client.optInForms.create({ label: 'Footer' });
    assert.deepEqual(h.last().body, { opt_in_form: { label: 'Footer' } });

    await h.client.optInForms.update(6, { enabled: false });
    assert.deepEqual(h.last().body, { opt_in_form: { enabled: false } });

    await h.client.optInForms.delete(6);
    assert.equal(h.last().method, 'DELETE');
  });

  test('analytics coerces Date to ISO-8601', async () => {
    const h = harness();
    await h.client.optInForms.analytics(6, { startDate: new Date('2026-01-01T00:00:00Z'), endDate: '2026-02-01' });

    assert.equal(h.last().path, '/api/v1/opt_in_forms/6/analytics');
    assert.equal(h.last().query.get('start_date'), '2026-01-01T00:00:00.000Z');
    assert.equal(h.last().query.get('end_date'), '2026-02-01');
  });

  test('analytics with no dates sends no params', async () => {
    const h = harness();
    await h.client.optInForms.analytics(6);
    assert.equal([...h.last().query.keys()].length, 0);
  });

  test('variants and duplicate', async () => {
    const h = harness();
    await h.client.optInForms.createVariant(6, { name: 'B', weight: 50 });
    assert.deepEqual([h.last().method, h.last().path], ['POST', '/api/v1/opt_in_forms/6/variants']);
    assert.deepEqual(h.last().body, { name: 'B', weight: 50 });

    await h.client.optInForms.createVariant(6);
    assert.deepEqual(h.last().body, null, 'an empty variant body must not send {}');

    await h.client.optInForms.duplicate(6, { label: 'Copy' });
    assert.deepEqual([h.last().method, h.last().path], ['POST', '/api/v1/opt_in_forms/6/duplicate']);
    assert.deepEqual(h.last().body, { label: 'Copy' });
  });
});

describe('Email servers', () => {
  test('CRUD wraps under email_server', async () => {
    const h = harness();
    await h.client.emailServers.list({ limit: 10, offset: 5 });
    assert.equal(h.last().path, '/api/v1/email_servers');
    assert.equal(h.last().query.get('limit'), '10');
    assert.equal(h.last().query.get('offset'), '5');

    await h.client.emailServers.get(8);
    assert.equal(h.last().path, '/api/v1/email_servers/8');

    await h.client.emailServers.create({ name: 'SES', smtp_password: 'real-secret' });
    assert.deepEqual(h.last().body, { email_server: { name: 'SES', smtp_password: 'real-secret' } });

    await h.client.emailServers.delete(8);
    assert.equal(h.last().method, 'DELETE');
  });

  test('test connection and copy to channel', async () => {
    const h = harness();
    await h.client.emailServers.testConnection(8);
    assert.deepEqual([h.last().method, h.last().path], ['POST', '/api/v1/email_servers/8/test_connection']);

    await h.client.emailServers.copyToChannel(8, 42);
    assert.equal(h.last().path, '/api/v1/email_servers/8/copy_to_channel');
    assert.deepEqual(h.last().body, { target_channel_id: 42 });
  });

  // The data-loss guard. The API returns credentials bullet-masked; writing one
  // back would replace a working SMTP password with bullets.
  test('update strips bullet-masked credentials and warns', async () => {
    const warnings: string[] = [];
    const h = harness({}, { logger: { warn: (m: string) => warnings.push(m) } });

    await h.client.emailServers.update(8, {
      name: 'Renamed',
      smtp_password: '••••••••',
      aws_secret_access_key: 'AKIA••••••••WXYZ',
    });

    assert.deepEqual(h.last().body, { email_server: { name: 'Renamed' } });
    assert.equal(warnings.length, 2);
    assert.match(warnings[0]!, /smtp_password/);
  });

  test('update keeps a real credential that merely contains no bullets', async () => {
    const h = harness();
    await h.client.emailServers.update(8, { smtp_password: 'genuinely-new-password' });
    assert.deepEqual(h.last().body, { email_server: { smtp_password: 'genuinely-new-password' } });
  });

  test('only the known credential fields are scrubbed', async () => {
    const h = harness();
    // A non-credential field that happens to hold bullets is left alone.
    await h.client.emailServers.update(8, { name: '••••••••' });
    assert.deepEqual(h.last().body, { email_server: { name: '••••••••' } });
  });
});

describe('Webhook endpoints', () => {
  test('CRUD wraps under webhook_endpoint', async () => {
    const h = harness();
    await h.client.webhookEndpoints.list();
    assert.equal(h.last().path, '/api/v1/webhook_endpoints');

    await h.client.webhookEndpoints.get(1);
    assert.equal(h.last().path, '/api/v1/webhook_endpoints/1');

    await h.client.webhookEndpoints.create({ url: 'https://x.com/hook', event_types: ['email.sent'] });
    assert.deepEqual(h.last().body, { webhook_endpoint: { url: 'https://x.com/hook', event_types: ['email.sent'] } });

    await h.client.webhookEndpoints.update(1, { enabled: false });
    assert.deepEqual(h.last().body, { webhook_endpoint: { enabled: false } });

    await h.client.webhookEndpoints.delete(1);
    assert.equal(h.last().method, 'DELETE');
  });

  test('test defaults to test.webhook', async () => {
    const h = harness();
    await h.client.webhookEndpoints.test(1);
    assert.deepEqual([h.last().method, h.last().path], ['POST', '/api/v1/webhook_endpoints/1/test']);
    assert.deepEqual(h.last().body, { event_type: 'test.webhook' });

    await h.client.webhookEndpoints.test(1, 'email.sent');
    assert.deepEqual(h.last().body, { event_type: 'email.sent' });
  });

  test('deliveries', async () => {
    const h = harness();
    await h.client.webhookEndpoints.deliveries(1, { page: 2 });
    assert.equal(h.last().path, '/api/v1/webhook_endpoints/1/deliveries');
    assert.equal(h.last().query.get('page'), '2');
  });
});

describe('Transactionals', () => {
  test('create sends a flat payload', async () => {
    const h = harness();
    await h.client.transactionals.create({
      to: 'a@b.com',
      subject: 'Receipt',
      body: '<p>Thanks</p>',
      replyTo: 'support@b.com',
    });

    assert.deepEqual([h.last().method, h.last().path], ['POST', '/api/v1/transactionals.json']);
    assert.deepEqual(h.last().body, {
      to: 'a@b.com',
      subject: 'Receipt',
      body: '<p>Thanks</p>',
      reply_to: 'support@b.com',
    });
  });

  test('omits keys that were not provided', async () => {
    const h = harness();
    await h.client.transactionals.create({ to: 'a@b.com', subject: 'Hi', body: 'x' });
    assert.deepEqual(Object.keys(h.last().body as object).sort(), ['body', 'subject', 'to']);
  });

  test('sends the Idempotency-Key header', async () => {
    const h = harness();
    await h.client.transactionals.create({ to: 'a@b.com', subject: 'S', body: 'B', idempotencyKey: 'order-42' });

    assert.equal(h.last().headers['idempotency-key'], 'order-42');
    assert.equal((h.last().body as Record<string, unknown>)['idempotencyKey'], undefined, 'the key is a header, not a body field');
    assert.equal((h.last().body as Record<string, unknown>)['idempotency_key'], undefined);
  });

  test('a blank idempotency key sends no header', async () => {
    const h = harness();
    await h.client.transactionals.create({ to: 'a@b.com', subject: 'S', body: 'B', idempotencyKey: '   ' });
    assert.equal(h.last().headers['idempotency-key'], undefined);
  });

  test('rejects an over-long idempotency key before sending', async () => {
    const h = harness();
    await assert.rejects(
      () => h.client.transactionals.create({ to: 'a@b.com', subject: 'S', body: 'B', idempotencyKey: 'x'.repeat(256) }),
      (e: Error) => {
        assert.match(e.message, /255 characters or fewer/);
        return true;
      },
    );
    assert.equal(h.calls.length, 0, 'must not have issued the request');
  });

  test('accepts a key of exactly 255 characters', async () => {
    const h = harness();
    await h.client.transactionals.create({ to: 'a@b.com', subject: 'S', body: 'B', idempotencyKey: 'x'.repeat(255) });
    assert.equal(h.last().headers['idempotency-key']!.length, 255);
  });

  test('passes template and double opt-in options through', async () => {
    const h = harness();
    await h.client.transactionals.create({
      to: 'a@b.com',
      templateId: 3,
      doubleOptIn: true,
      confirmationTemplateId: 9,
      includeUnsubscribeLink: true,
      preheader: 'Peek',
      subscriber: { first_name: 'Ada' },
    });

    assert.deepEqual(h.last().body, {
      to: 'a@b.com',
      template_id: 3,
      double_opt_in: true,
      confirmation_template_id: 9,
      include_unsubscribe_link: true,
      preheader: 'Peek',
      subscriber: { first_name: 'Ada' },
    });
  });

  test('get', async () => {
    const h = harness();
    await h.client.transactionals.get(11);
    assert.deepEqual([h.last().method, h.last().path], ['GET', '/api/v1/transactionals/11.json']);
  });

  test('client.sendEmail is a shim over transactionals.create', async () => {
    const h = harness();
    await h.client.sendEmail({ to: 'a@b.com', subject: 'S', body: 'B' });
    assert.equal(h.last().path, '/api/v1/transactionals.json');
  });
});

describe('Autopilots', () => {
  test('CRUD wraps under autopilot', async () => {
    const h = harness();
    await h.client.autopilots.list();
    assert.equal(h.last().path, '/api/v1/autopilots');

    await h.client.autopilots.get(2);
    assert.equal(h.last().path, '/api/v1/autopilots/2');

    await h.client.autopilots.create({ name: 'Weekly', ai_model: 'openai/gpt-4o' });
    assert.deepEqual(h.last().body, { autopilot: { name: 'Weekly', ai_model: 'openai/gpt-4o' } });

    await h.client.autopilots.update(2, { copies_to_generate: 5 });
    assert.deepEqual(h.last().body, { autopilot: { copies_to_generate: 5 } });

    await h.client.autopilots.delete(2);
    assert.equal(h.last().method, 'DELETE');
  });

  test('lifecycle and runs', async () => {
    const h = harness();
    for (const action of ['activate', 'pause', 'deactivate'] as const) {
      await h.client.autopilots[action](2);
      assert.deepEqual([h.last().method, h.last().path], ['POST', `/api/v1/autopilots/2/${action}`]);
    }

    await h.client.autopilots.triggerRun(2);
    assert.deepEqual([h.last().method, h.last().path], ['POST', '/api/v1/autopilots/2/trigger_run']);

    await h.client.autopilots.runs(2, { limit: 10 });
    assert.deepEqual([h.last().method, h.last().path], ['GET', '/api/v1/autopilots/2/runs']);
    assert.equal(h.last().query.get('limit'), '10');
  });

  test('update strips a bullet-masked openrouter key and warns', async () => {
    const warnings: string[] = [];
    const h = harness({}, { logger: { warn: (m: string) => warnings.push(m) } });

    await h.client.autopilots.update(2, { openrouter_api_key: '••••••••', ai_model: 'openai/gpt-4o' });

    assert.deepEqual(h.last().body, { autopilot: { ai_model: 'openai/gpt-4o' } });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /openrouter_api_key/);
  });

  test('a real openrouter key is sent through', async () => {
    const h = harness();
    await h.client.autopilots.update(2, { openrouter_api_key: 'sk-or-v1-realkey' });
    assert.deepEqual(h.last().body, { autopilot: { openrouter_api_key: 'sk-or-v1-realkey' } });
  });
});

describe('Migration', () => {
  const COLLECTIONS = [
    'channels', 'subscribers', 'templates', 'segments', 'sequences', 'emailServers',
    'optInForms', 'broadcasts', 'outboundReceipts', 'webhookEndpoints', 'tokens',
    'suppressions', 'tags', 'users', 'linkRedirects', 'linkClicks',
    'subscriberHistories', 'fileAssets',
  ] as const;

  const PATHS: Record<string, string> = {
    emailServers: 'email_servers',
    optInForms: 'opt_in_forms',
    outboundReceipts: 'outbound_receipts',
    webhookEndpoints: 'webhook_endpoints',
    linkRedirects: 'link_redirects',
    linkClicks: 'link_clicks',
    subscriberHistories: 'subscriber_histories',
    fileAssets: 'file_assets',
  };

  test('all 18 collections hit their migration path', async () => {
    const h = harness({ data: [], pagination: { has_more: false } });

    for (const collection of COLLECTIONS) {
      await h.client.migration[collection]({ limit: 10 });
      const expected = PATHS[collection] ?? collection;
      assert.deepEqual([h.last().method, h.last().path], ['GET', `/api/migration/v1/${expected}`], collection);
      assert.equal(h.last().query.get('limit'), '10');
    }
  });

  test('manifest', async () => {
    const h = harness();
    await h.client.migration.manifest({ days_history: 30 });
    assert.equal(h.last().path, '/api/migration/v1/manifest');
    assert.equal(h.last().query.get('days_history'), '30');
  });

  test('downloadFileAsset returns bytes', async () => {
    const fetchImpl = async () =>
      new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), { status: 200, headers: { 'content-type': 'image/png' } });
    const { Broadcast } = await import('../src/client.ts');
    const client = new Broadcast({
      apiToken: 't',
      host: 'https://mail.example.com',
      fetch: fetchImpl as unknown as typeof globalThis.fetch,
    });

    const bytes = await client.migration.downloadFileAsset(3);
    assert.ok(bytes instanceof Uint8Array);
    assert.deepEqual([...bytes], [0x89, 0x50, 0x4e, 0x47]);
  });

  test('eachRecord pages until has_more is false', async () => {
    const h = harness([
      { data: [{ id: 1 }, { id: 2 }], pagination: { has_more: true, limit: 2 } },
      { data: [{ id: 3 }], pagination: { has_more: false, limit: 2 } },
    ]);

    const seen: number[] = [];
    for await (const record of h.client.migration.eachRecord('subscribers', { limit: 2 })) {
      seen.push((record as { id: number }).id);
    }

    assert.deepEqual(seen, [1, 2, 3]);
    assert.equal(h.calls.length, 2);
    assert.equal(h.calls[0]!.query.get('offset'), '0');
    assert.equal(h.calls[1]!.query.get('offset'), '2');
  });

  test('eachRecord advances by the server-reported limit, not the requested one', async () => {
    // The server clamps limit to 250. Advancing by the requested 1000 would skip records.
    const h = harness([
      { data: Array.from({ length: 250 }, (_, i) => ({ id: i })), pagination: { has_more: true, limit: 250 } },
      { data: [{ id: 250 }], pagination: { has_more: false, limit: 250 } },
    ]);

    const seen: unknown[] = [];
    for await (const record of h.client.migration.eachRecord('subscribers', { limit: 1000 })) {
      seen.push(record);
    }

    assert.equal(seen.length, 251);
    assert.equal(h.calls[1]!.query.get('offset'), '250');
  });

  test('eachRecord stops rather than looping forever when the server reports a zero limit', async () => {
    const h = harness({ data: [{ id: 1 }], pagination: { has_more: true, limit: 0 } });

    const seen: unknown[] = [];
    for await (const record of h.client.migration.eachRecord('subscribers')) {
      seen.push(record);
    }

    assert.equal(seen.length, 1);
    assert.equal(h.calls.length, 1, 'a zero advance must break the loop, not spin');
  });
});

describe('Channel scoping', () => {
  test('broadcastChannelId is injected into query params', async () => {
    const h = harness({}, { broadcastChannelId: 42 });
    await h.client.migration.subscribers();
    assert.equal(h.last().query.get('broadcast_channel_id'), '42');
  });

  test('broadcastChannelId is injected into bodies', async () => {
    const h = harness({}, { broadcastChannelId: 42 });
    await h.client.broadcasts.create({ subject: 'Hi' });
    assert.deepEqual(h.last().body, { subject: 'Hi', broadcast_channel_id: 42 });
  });

  test('an explicit broadcast_channel_id wins', async () => {
    const h = harness({}, { broadcastChannelId: 42 });
    await h.client.migration.subscribers({ broadcast_channel_id: 7 });
    assert.equal(h.last().query.get('broadcast_channel_id'), '7');
  });

  test('withChannel scopes only the calls inside it', async () => {
    const h = harness();

    await h.client.withChannel(99, async () => {
      await h.client.migration.subscribers();
    });
    assert.equal(h.last().query.get('broadcast_channel_id'), '99');

    await h.client.migration.subscribers();
    assert.equal(h.last().query.has('broadcast_channel_id'), false, 'the override must not leak past the block');
  });

  test('withChannel restores the previous scope even when the block throws', async () => {
    const h = harness({}, { broadcastChannelId: 42 });

    await assert.rejects(() =>
      h.client.withChannel(99, async () => {
        throw new Error('boom');
      }),
    );

    await h.client.migration.subscribers();
    assert.equal(h.last().query.get('broadcast_channel_id'), '42');
  });

  test('withChannel returns the block result', async () => {
    const h = harness({ id: 1 });
    const result = await h.client.withChannel(99, async () => 'returned');
    assert.equal(result, 'returned');
  });
});
