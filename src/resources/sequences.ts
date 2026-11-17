import { BaseResource, wrapIn, type Id, type Params } from './base.ts';

export class Sequences extends BaseResource {
  list<T = any>(params: Params = {}): Promise<T> {
    return this.httpGet<T>('/api/v1/sequences', params);
  }

  get<T = any>(id: Id, options: { includeSteps?: boolean } = {}): Promise<T> {
    return this.httpGet<T>(`/api/v1/sequences/${id}`, options.includeSteps ? { include_steps: true } : {});
  }

  /** Nests the attributes under `sequence`, because the API reads them with `params.require(:sequence)`. */
  create<T = any>(attrs: Params): Promise<T> {
    return this.httpPost<T>('/api/v1/sequences', wrapIn('sequence', attrs));
  }

  /** Nests the attributes under `sequence`, like `create`. */
  update<T = any>(id: Id, attrs: Params): Promise<T> {
    return this.httpPatch<T>(`/api/v1/sequences/${id}`, wrapIn('sequence', attrs));
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
    return this.httpPost<T>(`/api/v1/sequences/${sequenceId}/add_subscriber`, wrapIn('subscriber', attrs));
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

  /**
   * Nests the attributes under `sequence_step`, because the API reads them with `params.require(:sequence_step)`.
   * Older servers drop `taggify_list` when it is sent flat.
   */
  createStep<T = any>(sequenceId: Id, attrs: Params): Promise<T> {
    return this.httpPost<T>(`/api/v1/sequences/${sequenceId}/steps`, wrapIn('sequence_step', attrs));
  }

  /** Nests the attributes under `sequence_step`, like `createStep`. */
  updateStep<T = any>(sequenceId: Id, stepId: Id, attrs: Params): Promise<T> {
    return this.httpPatch<T>(`/api/v1/sequences/${sequenceId}/steps/${stepId}`, wrapIn('sequence_step', attrs));
  }

  /** Reorders a step to sit directly after `underId`. */
  moveStep<T = any>(sequenceId: Id, stepId: Id, underId: Id): Promise<T> {
    return this.httpPost<T>(`/api/v1/sequences/${sequenceId}/steps/${stepId}/move`, { under_id: underId });
  }

  deleteStep<T = any>(sequenceId: Id, stepId: Id): Promise<T> {
    return this.httpDelete<T>(`/api/v1/sequences/${sequenceId}/steps/${stepId}`);
  }
}
