import { BaseResource, type Id, type Params } from './base.ts';

/**
 * A subscriber topic: one kind of email subscribers opt in to or out of. Its
 * value lives in a top-level custom_data key (true, false, or no value) or in a
 * tag. Topics use the token's subscriber permissions.
 */
export interface TopicParams extends Params {
  name?: string;
  description?: string;
  storage?: 'custom_data' | 'tag';
  custom_data_key?: string;
  tag_name?: string;
  /** Whether a subscriber with no value receives the topic. Must stay false for a tag topic. */
  unset_receives?: boolean;
  visible_on_preference_page?: boolean;
}

export class Topics extends BaseResource {
  list<T = any>(params: Params = {}): Promise<T> {
    return this.httpGet<T>('/api/v1/topics.json', params);
  }

  get<T = any>(id: Id): Promise<T> {
    return this.httpGet<T>(`/api/v1/topics/${id}.json`);
  }

  create<T = any>(attrs: TopicParams): Promise<T> {
    return this.httpPost<T>('/api/v1/topics', { topic: attrs });
  }

  update<T = any>(id: Id, attrs: TopicParams): Promise<T> {
    return this.httpPatch<T>(`/api/v1/topics/${id}`, { topic: attrs });
  }

  /** Refused (422) while a broadcast or sequence uses the topic. */
  delete<T = any>(id: Id): Promise<T> {
    return this.httpDelete<T>(`/api/v1/topics/${id}`);
  }
}
