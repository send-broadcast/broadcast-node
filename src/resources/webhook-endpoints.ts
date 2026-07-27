import { BaseResource, type Id, type Params } from './base.ts';
import type { EventType } from '../webhook.ts';

export class WebhookEndpoints extends BaseResource {
  list<T = any>(params: Params = {}): Promise<T> {
    return this.httpGet<T>('/api/v1/webhook_endpoints', params);
  }

  get<T = any>(id: Id): Promise<T> {
    return this.httpGet<T>(`/api/v1/webhook_endpoints/${id}`);
  }

  /** The `secret` is returned once, on create, and never again. */
  create<T = any>(attrs: Params): Promise<T> {
    return this.httpPost<T>('/api/v1/webhook_endpoints', { webhook_endpoint: attrs });
  }

  update<T = any>(id: Id, attrs: Params): Promise<T> {
    return this.httpPatch<T>(`/api/v1/webhook_endpoints/${id}`, { webhook_endpoint: attrs });
  }

  delete<T = any>(id: Id): Promise<T> {
    return this.httpDelete<T>(`/api/v1/webhook_endpoints/${id}`);
  }

  test<T = any>(id: Id, eventType: EventType | string = 'test.webhook'): Promise<T> {
    return this.httpPost<T>(`/api/v1/webhook_endpoints/${id}/test`, { event_type: eventType });
  }

  deliveries<T = any>(id: Id, params: Params = {}): Promise<T> {
    return this.httpGet<T>(`/api/v1/webhook_endpoints/${id}/deliveries`, params);
  }
}
