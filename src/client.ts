import { Configuration, type ConfigurationOptions } from './configuration.ts';
import { Connection, type HttpMethod, type RequestOptions } from './connection.ts';

import { Autopilots } from './resources/autopilots.ts';
import { Broadcasts } from './resources/broadcasts.ts';
import { Discovery } from './resources/discovery.ts';
import { EmailServers } from './resources/email-servers.ts';
import { Migration } from './resources/migration.ts';
import { OptInForms } from './resources/opt-in-forms.ts';
import { Segments } from './resources/segments.ts';
import { Sequences } from './resources/sequences.ts';
import { Subscribers } from './resources/subscribers.ts';
import { Templates } from './resources/templates.ts';
import { Transactionals, type TransactionalCreateParams } from './resources/transactionals.ts';
import { WebhookEndpoints } from './resources/webhook-endpoints.ts';

export class Broadcast {
  readonly config: Configuration;
  private readonly connection: Connection;

  /**
   * Channel override for withChannel(). Node has no thread-locals; an instance
   * field is the honest equivalent, and the caveat is documented on withChannel.
   */
  private channelOverride: string | number | undefined;

  readonly subscribers: Subscribers;
  readonly sequences: Sequences;
  readonly broadcasts: Broadcasts;
  readonly segments: Segments;
  readonly templates: Templates;
  readonly webhookEndpoints: WebhookEndpoints;
  readonly transactionals: Transactionals;
  readonly optInForms: OptInForms;
  readonly emailServers: EmailServers;
  readonly autopilots: Autopilots;
  readonly discovery: Discovery;
  /** Read-only export endpoints. Requires an admin (system) API token. */
  readonly migration: Migration;

  constructor(options: ConfigurationOptions = {}) {
    this.config = new Configuration(options);
    this.config.validate();
    this.connection = new Connection(this.config);

    this.subscribers = new Subscribers(this);
    this.sequences = new Sequences(this);
    this.broadcasts = new Broadcasts(this);
    this.segments = new Segments(this);
    this.templates = new Templates(this);
    this.webhookEndpoints = new WebhookEndpoints(this);
    this.transactionals = new Transactionals(this);
    this.optInForms = new OptInForms(this);
    this.emailServers = new EmailServers(this);
    this.autopilots = new Autopilots(this);
    this.discovery = new Discovery(this);
    this.migration = new Migration(this);
  }

  // --- Channel scoping (admin/system tokens) ---

  /**
   * Runs `fn` with a temporary broadcast_channel_id applied to every request
   * inside it, then restores the previous scope — including when `fn` throws.
   *
   *   await client.withChannel(123, async () => {
   *     await client.emailServers.list();
   *   });
   *
   * The override lives on the client instance. Concurrent calls on the SAME
   * client instance will interleave and see each other's scope; use a separate
   * client per channel, or pass broadcast_channel_id explicitly, when running
   * channels in parallel.
   */
  async withChannel<T>(broadcastChannelId: string | number, fn: () => Promise<T> | T): Promise<T> {
    const previous = this.channelOverride;
    this.channelOverride = broadcastChannelId;
    try {
      return await fn();
    } finally {
      this.channelOverride = previous;
    }
  }

  // --- Transactional email (convenience shims) ---

  /**
   * Thin wrapper around transactionals.create. Use that directly for
   * templateId, doubleOptIn, preheader, idempotencyKey and the rest.
   */
  sendEmail<T = any>(params: TransactionalCreateParams): Promise<T> {
    return this.transactionals.create<T>(params);
  }

  getEmail<T = any>(id: string | number): Promise<T> {
    return this.transactionals.get<T>(id);
  }

  // --- Discovery (convenience shims) ---

  whoami<T = any>(): Promise<T> {
    return this.discovery.whoami<T>();
  }

  status<T = any>(): Promise<T> {
    return this.discovery.status<T>();
  }

  prime<T = any>(): Promise<T> {
    return this.discovery.prime<T>();
  }

  skill(): Promise<string> {
    return this.discovery.skill();
  }

  /** @internal */
  request<T = any>(
    method: HttpMethod,
    path: string,
    bodyOrParams: unknown = null,
    options: RequestOptions = {},
  ): Promise<T> {
    return this.connection.request<T>(method, path, this.injectChannelScope(bodyOrParams), options);
  }

  private get activeChannelId(): string | number | undefined {
    return this.channelOverride ?? this.config.broadcastChannelId;
  }

  /**
   * Auto-includes broadcast_channel_id when configured (or set via withChannel)
   * and the caller has not already specified one.
   */
  private injectChannelScope(bodyOrParams: unknown): unknown {
    const channelId = this.activeChannelId;
    if (channelId === undefined || channelId === null) return bodyOrParams;

    const payload: Record<string, unknown> =
      bodyOrParams !== null && typeof bodyOrParams === 'object' && !Array.isArray(bodyOrParams)
        ? { ...(bodyOrParams as Record<string, unknown>) }
        : {};

    if (payload['broadcast_channel_id'] !== undefined) return payload;

    payload['broadcast_channel_id'] = channelId;
    return payload;
  }
}
