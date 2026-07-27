import { BaseResource, type Id, type Params } from './base.ts';

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

  create<T = any>(attrs: Params): Promise<T> {
    return this.httpPost<T>('/api/v1/broadcasts', attrs);
  }

  update<T = any>(id: Id, attrs: Params): Promise<T> {
    return this.httpPatch<T>(`/api/v1/broadcasts/${id}`, attrs);
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
