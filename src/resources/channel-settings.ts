import { BaseResource, type Params } from './base.ts';

/**
 * The settings of the token's channel (Broadcast 2.46.0 or later), grouped
 * like the Settings pages: general, sender, unsubscribe_page (with the privacy
 * policy and legal notice links) and confirmation_page. Reading requires
 * `channel_settings_read`, changing requires `channel_settings_write`.
 *
 * Always the channel the token resolves to; there is no channel parameter.
 */
export class ChannelSettings extends BaseResource {
  get<T = any>(): Promise<T> {
    return this.httpGet<T>('/api/v1/channel/settings');
  }

  /**
   * Partial update: send only the groups and keys that change. Nested text and
   * colours merge, an empty string or null removes a value, and `languages`
   * replaces the list. Resolves to every setting after the change; read any
   * warnings with `meta(result).warnings`.
   */
  update<T = any>(settings: Params): Promise<T> {
    return this.httpPatch<T>('/api/v1/channel/settings', { channel_settings: settings });
  }
}
