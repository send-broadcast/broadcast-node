import { BaseResource, compact, type Id, type Params } from './base.ts';

export interface AnalyticsParams {
  /** Date or ISO-8601 string. Defaults server-side to the last 30 days. */
  startDate?: Date | string;
  endDate?: Date | string;
}

export class OptInForms extends BaseResource {
  /**
   * Up to 250 per page with `pagination` metadata. Variants are excluded — only
   * main forms are returned.
   *
   * Filters: filter (label substring), widget_type, enabled.
   */
  list<T = any>(params: Params = {}): Promise<T> {
    return this.httpGet<T>('/api/v1/opt_in_forms', params);
  }

  get<T = any>(id: Id): Promise<T> {
    return this.httpGet<T>(`/api/v1/opt_in_forms/${id}`);
  }

  /**
   * Nested settings objects (theme_settings, automation_settings,
   * security_settings, trigger_settings, widget_settings) and the block arrays
   * are passed through verbatim.
   */
  create<T = any>(attrs: Params): Promise<T> {
    return this.httpPost<T>('/api/v1/opt_in_forms', { opt_in_form: attrs });
  }

  update<T = any>(id: Id, attrs: Params): Promise<T> {
    return this.httpPatch<T>(`/api/v1/opt_in_forms/${id}`, { opt_in_form: attrs });
  }

  delete<T = any>(id: Id): Promise<T> {
    return this.httpDelete<T>(`/api/v1/opt_in_forms/${id}`);
  }

  analytics<T = any>(id: Id, params: AnalyticsParams = {}): Promise<T> {
    const query = compact({
      start_date: params.startDate === undefined ? undefined : coerceDate(params.startDate),
      end_date: params.endDate === undefined ? undefined : coerceDate(params.endDate),
    });
    return this.httpGet<T>(`/api/v1/opt_in_forms/${id}/analytics`, query);
  }

  createVariant<T = any>(id: Id, params: { name?: string; weight?: number } = {}): Promise<T> {
    return this.httpPost<T>(`/api/v1/opt_in_forms/${id}/variants`, compact({ name: params.name, weight: params.weight }));
  }

  duplicate<T = any>(id: Id, params: { label?: string } = {}): Promise<T> {
    return this.httpPost<T>(`/api/v1/opt_in_forms/${id}/duplicate`, compact({ label: params.label }));
  }
}

function coerceDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}
