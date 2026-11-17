import { BaseResource, wrapIn, type Id, type Params } from './base.ts';

export interface ScheduleParams extends Params {
  scheduled_send_at: string;
  scheduled_timezone: string;
}

export class Broadcasts extends BaseResource {
  list<T = any>(params: Params = {}): Promise<T> {
    return this.httpGet<T>('/api/v1/broadcasts', params);
  }

  get<T = any>(id: Id): Promise<T> {
    return this.httpGet<T>(`/api/v1/broadcasts/${id}`);
  }

  /**
   * Nests the attributes under `broadcast`, because the API reads them with `params.require(:broadcast)`.
   * Older servers drop keys such as `taggify_list` and `email_headers` when they are sent flat.
   */
  create<T = any>(attrs: Params): Promise<T> {
    return this.httpPost<T>('/api/v1/broadcasts', wrapIn('broadcast', attrs));
  }

  /** Nests the attributes under `broadcast`, like `create`. */
  update<T = any>(id: Id, attrs: Params): Promise<T> {
    return this.httpPatch<T>(`/api/v1/broadcasts/${id}`, wrapIn('broadcast', attrs));
  }

  delete<T = any>(id: Id): Promise<T> {
    return this.httpDelete<T>(`/api/v1/broadcasts/${id}`);
  }

  /** Sends immediately. There is no undo — the API has no unsend. */
  send<T = any>(id: Id): Promise<T> {
    return this.httpPost<T>(`/api/v1/broadcasts/${id}/send_broadcast`);
  }

  schedule<T = any>(id: Id, params: ScheduleParams): Promise<T> {
    return this.httpPost<T>(`/api/v1/broadcasts/${id}/schedule_broadcast`, {
      scheduled_send_at: params.scheduled_send_at,
      scheduled_timezone: params.scheduled_timezone,
    });
  }

  cancelSchedule<T = any>(id: Id): Promise<T> {
    return this.httpPost<T>(`/api/v1/broadcasts/${id}/cancel_schedule`);
  }

  statistics<T = any>(id: Id): Promise<T> {
    return this.httpGet<T>(`/api/v1/broadcasts/${id}/statistics`);
  }

  statisticsTimeline<T = any>(id: Id, params: Params = {}): Promise<T> {
    return this.httpGet<T>(`/api/v1/broadcasts/${id}/statistics/timeline`, params);
  }

  statisticsLinks<T = any>(id: Id, params: Params = {}): Promise<T> {
    return this.httpGet<T>(`/api/v1/broadcasts/${id}/statistics/links`, params);
  }
}
