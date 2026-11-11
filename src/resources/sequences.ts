import { BaseResource, type Id, type Params } from './base.ts';

export class Sequences extends BaseResource {
  list<T = any>(params: Params = {}): Promise<T> {
    return this.httpGet<T>('/api/v1/sequences', params);
  }

  get<T = any>(id: Id, options: { includeSteps?: boolean } = {}): Promise<T> {
    return this.httpGet<T>(`/api/v1/sequences/${id}`, options.includeSteps ? { include_steps: true } : {});
  }

  create<T = any>(attrs: Params): Promise<T> {
    return this.httpPost<T>('/api/v1/sequences', attrs);
  }

  update<T = any>(id: Id, attrs: Params): Promise<T> {
    return this.httpPatch<T>(`/api/v1/sequences/${id}`, attrs);
  }

  delete<T = any>(id: Id): Promise<T> {
    return this.httpDelete<T>(`/api/v1/sequences/${id}`);
  }

  // --- Subscriber enrollment ---

  //
  // Both nest the attributes under `subscriber`, because the API reads them
  // with `params.require(:subscriber)`. Sent flat, the server answers 400.

  /**
   * Enrolls a subscriber. Pass `{ email, first_name?, last_name? }`; the client
   * wraps it in `subscriber`. A body that already has `subscriber` is sent as is.
   */
  addSubscriber<T = any>(sequenceId: Id, attrs: Params): Promise<T> {
    return this.httpPost<T>(`/api/v1/sequences/${sequenceId}/add_subscriber`, wrapSubscriber(attrs));
  }

  removeSubscriber<T = any>(sequenceId: Id, email: string): Promise<T> {
    return this.httpDelete<T>(`/api/v1/sequences/${sequenceId}/remove_subscriber`, { subscriber: { email } });
  }

  listSubscribers<T = any>(sequenceId: Id, params: { page?: number } = {}): Promise<T> {
    return this.httpGet<T>(`/api/v1/sequences/${sequenceId}/list_subscribers`, { page: params.page ?? 1 });
  }

  // --- Steps ---
  //
  // Steps hang off the sequences resource rather than living at
  // client.sequenceSteps, matching the nested routes.

  listSteps<T = any>(sequenceId: Id): Promise<T> {
    return this.httpGet<T>(`/api/v1/sequences/${sequenceId}/steps`);
  }

  getStep<T = any>(sequenceId: Id, stepId: Id): Promise<T> {
    return this.httpGet<T>(`/api/v1/sequences/${sequenceId}/steps/${stepId}`);
  }

  createStep<T = any>(sequenceId: Id, attrs: Params): Promise<T> {
    return this.httpPost<T>(`/api/v1/sequences/${sequenceId}/steps`, attrs);
  }

  updateStep<T = any>(sequenceId: Id, stepId: Id, attrs: Params): Promise<T> {
    return this.httpPatch<T>(`/api/v1/sequences/${sequenceId}/steps/${stepId}`, attrs);
  }

  /** Reorders a step to sit directly after `underId`. */
  moveStep<T = any>(sequenceId: Id, stepId: Id, underId: Id): Promise<T> {
    return this.httpPost<T>(`/api/v1/sequences/${sequenceId}/steps/${stepId}/move`, { under_id: underId });
  }

  deleteStep<T = any>(sequenceId: Id, stepId: Id): Promise<T> {
    return this.httpDelete<T>(`/api/v1/sequences/${sequenceId}/steps/${stepId}`);
  }
}

/** Nests flat subscriber attributes under `subscriber`, leaving an already-wrapped body alone. */
function wrapSubscriber(attrs: Params): Params {
  const nested = attrs.subscriber;
  if (nested !== null && typeof nested === 'object' && !Array.isArray(nested)) return attrs;
  return { subscriber: attrs };
}
