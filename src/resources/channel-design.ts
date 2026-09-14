import { BaseResource } from './base.ts';

/**
 * The brand kit of the token's channel, read-only. Requires `templates_read`.
 *
 * Always reads the channel the token resolves to; there is no channel
 * parameter. Defaults are filled in, so every key is present even on a channel
 * with no kit configured: colors, typography (font + font_stack), layout
 * (width, radius) and brand (logo_url, logo_width, website_url, social_links,
 * social_icon_style). logo_url is a public URL, or null when no logo is set.
 */
export class ChannelDesign extends BaseResource {
  get<T = any>(): Promise<T> {
    return this.httpGet<T>('/api/v1/channel/design');
  }
}
