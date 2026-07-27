import { BaseResource, type Id, type Params } from './base.ts';

export interface TemplateParams extends Params {
  label?: string;
  subject?: string;
  preheader?: string;
  body?: string;
  html_body?: string;

  /** Confirmation templates (double opt-in). */
  template_purpose?: string;
  confirmation_text?: string;
  default_confirmation?: boolean;
  /** Per-state page copy, keyed by state, each taking { heading, body }. */
  confirmation_page_settings?: Record<string, { heading?: string; body?: string }>;
}

export class Templates extends BaseResource {
  list<T = any>(params: Params = {}): Promise<T> {
    return this.httpGet<T>('/api/v1/templates', params);
  }

  get<T = any>(id: Id): Promise<T> {
    return this.httpGet<T>(`/api/v1/templates/${id}`);
  }

  /**
   * Anything the server does not recognise comes back as an
   * `unrecognized_parameter` warning on the response rather than an error, so
   * check meta(result).warnings when adding new fields.
   */
  create<T = any>(attrs: TemplateParams): Promise<T> {
    return this.httpPost<T>('/api/v1/templates', { template: attrs });
  }

  update<T = any>(id: Id, attrs: TemplateParams): Promise<T> {
    return this.httpPatch<T>(`/api/v1/templates/${id}`, { template: attrs });
  }

  delete<T = any>(id: Id): Promise<T> {
    return this.httpDelete<T>(`/api/v1/templates/${id}`);
  }
}
