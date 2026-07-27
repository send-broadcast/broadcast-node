import { BaseResource } from './base.ts';

/**
 * Introspection endpoints. Built for agents and CLIs that need to discover what
 * a token can do before acting, and equally useful as a deploy-time smoke check.
 */
export class Discovery extends BaseResource {
  /** Token label, type (channel_scoped or admin_cross_channel), permissions, resolved channel. */
  whoami<T = any>(): Promise<T> {
    return this.httpGet<T>('/api/v1/whoami');
  }

  /**
   * Channel sender config, subscriber counts, and per-feature transmission
   * readiness. Worth calling before a send — readiness.broadcasts === false
   * means the channel has no usable email server or sender identity.
   */
  status<T = any>(): Promise<T> {
    return this.httpGet<T>('/api/v1/status');
  }

  /** Full capability manifest: version, permissions, endpoint list, rate limit. */
  prime<T = any>(): Promise<T> {
    return this.httpGet<T>('/api/v1/prime');
  }

  /**
   * Plain-text agent skill manifest (Markdown with YAML front matter), including
   * the safety rules agents are expected to follow. Returns a string, not an
   * object — this endpoint serves text/plain.
   */
  skill(): Promise<string> {
    return this.client.request<string>('GET', '/api/v1/skill', null, { raw: true });
  }
}
