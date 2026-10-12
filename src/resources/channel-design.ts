import { BaseResource, type Params } from './base.ts';

/**
 * The brand kit of the token's channel. Reading requires `templates_read` (or,
 * from Broadcast 2.46.0, `channel_settings_read`).
 *
 * Always the channel the token resolves to; there is no channel parameter.
 * Defaults are filled in, so every key is present even on a channel with no
 * kit configured: colors, typography (font + font_stack), layout (width,
 * radius) and brand (logo_url, logo_width, website_url, social_links,
 * social_icon_style). logo_url is a public URL, or null when no logo is set.
 */
export class ChannelDesign extends BaseResource {
  get<T = any>(): Promise<T> {
    return this.httpGet<T>('/api/v1/channel/design');
  }

  /**
   * Changes the brand kit (Broadcast 2.46.0 or later). Requires
   * `channel_settings_write`.
   *
   * Partial: send only what changes, in the shape `get()` returns. An empty
   * string or null puts a value back to its default; `social_links` replaces
   * the list; font_stack and width are read-only. Set the logo with the
   * `logo_url` of an image in the channel's file library (the server never
   * fetches a URL). Resolves to the whole kit after the change; read any
   * warnings with `meta(result).warnings`.
   */
  update<T = any>(design: Params): Promise<T> {
    return this.httpPatch<T>('/api/v1/channel/design', { channel_design: design });
  }
}
