import { BaseResource, type Id, type Params } from './base.ts';

/**
 * The API renders a configured key bullet-masked and never returns the real
 * value. Writing a masked value back would replace a working credential with
 * bullets, so update() strips it — the same guard as EmailServers.
 */
const REDACTED_KEY_PATTERN = /^•+$/;

export interface AutopilotParams extends Params {
  /** Required, unique per channel. */
  name?: string;
  /** OpenRouter credential — write-only, never returned. */
  openrouter_api_key?: string;
  ai_model?: string;
  schedule_frequency?: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  schedule_day_of_week?: number;
  schedule_day_of_month?: number;
  schedule_time?: string;
  schedule_timezone?: string;
  /** How many drafts each run produces. */
  copies_to_generate?: number;
  tone_description?: string;
  content_instructions?: string;
  newsletter_structure?: string;
  /** Restrict the newsletter's audience. */
  segment_ids?: Id[];
}

/**
 * Autopilot — AI-generated newsletters. Requires the autopilot_read /
 * autopilot_write token permissions.
 *
 * Sources and tone samples have no API endpoints; they are configured in the
 * web UI. Since activate() requires an active source, an autopilot created
 * entirely over the API cannot be activated until a source is added there.
 */
export class Autopilots extends BaseResource {
  list<T = any>(params: Params = {}): Promise<T> {
    return this.httpGet<T>('/api/v1/autopilots', params);
  }

  get<T = any>(id: Id): Promise<T> {
    return this.httpGet<T>(`/api/v1/autopilots/${id}`);
  }

  create<T = any>(attrs: AutopilotParams): Promise<T> {
    return this.httpPost<T>('/api/v1/autopilots', { autopilot: attrs });
  }

  /** Pass the real key to rotate it, or omit the field. A masked key is dropped. */
  update<T = any>(id: Id, attrs: AutopilotParams): Promise<T> {
    return this.httpPatch<T>(`/api/v1/autopilots/${id}`, { autopilot: this.scrubRedactedKey(attrs) });
  }

  delete<T = any>(id: Id): Promise<T> {
    return this.httpDelete<T>(`/api/v1/autopilots/${id}`);
  }

  // --- Lifecycle ---

  /**
   * Requires at least one active source, an API key, and a model. Raises
   * ValidationError naming the missing prerequisites otherwise.
   */
  activate<T = any>(id: Id): Promise<T> {
    return this.httpPost<T>(`/api/v1/autopilots/${id}/activate`);
  }

  pause<T = any>(id: Id): Promise<T> {
    return this.httpPost<T>(`/api/v1/autopilots/${id}/pause`);
  }

  deactivate<T = any>(id: Id): Promise<T> {
    return this.httpPost<T>(`/api/v1/autopilots/${id}/deactivate`);
  }

  /** Returns 202 — generation is asynchronous, so poll runs() for progress. */
  triggerRun<T = any>(id: Id): Promise<T> {
    return this.httpPost<T>(`/api/v1/autopilots/${id}/trigger_run`);
  }

  /** Generation runs, most recent first. Supports limit and offset. */
  runs<T = any>(id: Id, params: Params = {}): Promise<T> {
    return this.httpGet<T>(`/api/v1/autopilots/${id}/runs`, params);
  }

  private scrubRedactedKey(attrs: AutopilotParams): AutopilotParams {
    const key = attrs['openrouter_api_key'];
    if (typeof key !== 'string' || !REDACTED_KEY_PATTERN.test(key)) return attrs;

    this.warn(
      '[broadcast-node] Dropped redacted openrouter_api_key from update payload — ' +
        'pass the real key or omit the field',
    );

    const { openrouter_api_key: _dropped, ...rest } = attrs;
    return rest;
  }
}
