import { BaseResource, type Id, type Params } from './base.ts';

export class Segments extends BaseResource {
  list<T = any>(params: Params = {}): Promise<T> {
    return this.httpGet<T>('/api/v1/segments.json', params);
  }

  /** Reading a segment recounts its members server-side, so this is not free. */
  get<T = any>(id: Id, params: { page?: number } = {}): Promise<T> {
    return this.httpGet<T>(`/api/v1/segments/${id}.json`, params.page ? { page: params.page } : {});
  }

  create<T = any>(attrs: Params): Promise<T> {
    return this.httpPost<T>('/api/v1/segments', { segment: attrs });
  }

  update<T = any>(id: Id, attrs: Params): Promise<T> {
    return this.httpPatch<T>(`/api/v1/segments/${id}`, { segment: attrs });
  }

  delete<T = any>(id: Id): Promise<T> {
    return this.httpDelete<T>(`/api/v1/segments/${id}`);
  }
}
