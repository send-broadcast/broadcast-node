import { BaseResource, compact, type Id, type Params } from './base.ts';

export interface SystemPermissions {
  user_management: boolean;
  channel_management: boolean;
  system_settings: boolean;
  system_monitoring: boolean;
  system_backups: boolean;
  system_updates: boolean;
  billing_management: boolean;
}

export interface ChannelPermission {
  broadcast_channel_id: number;
  broadcast_channel_name: string;
  /** "Viewer" | "Editor" | "Manager" | a preset's name | "Custom" */
  role: string;
  permissions: Record<string, boolean>;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  active: boolean;
  locked: boolean;
  /** Sudo users are read-only through this API: writes to them return 403. */
  sudo: boolean;
  two_factor_enabled: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserDetail extends User {
  system_permissions: SystemPermissions;
  channel_permissions: ChannelPermission[];
}

export interface UserListParams {
  limit?: number;
  offset?: number;
  /** Matches against email and name. */
  q?: string;
  status?: 'active' | 'inactive';
}

export interface UserCreateParams {
  email: string;
  first_name: string;
  last_name: string;
  /** One of password or send_password_reset: true is required. */
  password?: string;
  send_password_reset?: boolean;
}

export type UserUpdateParams = Partial<Pick<UserCreateParams, 'email' | 'first_name' | 'last_name' | 'password'>>;

/**
 * Exactly one of these must be given. `permissions` replaces the channel's
 * whole permission record — any flag not listed becomes false.
 */
export interface ChannelPermissionWrite {
  permissions?: Record<string, boolean>;
  role?: string;
  presetId?: Id;
}

export interface BulkChannelPermissionsParams extends ChannelPermissionWrite {
  broadcastChannelIds: Id[];
}

export interface BulkChannelPermissionsResult<T = ChannelPermission> {
  applied: T[];
  failed: { broadcast_channel_id: Id; error: string }[];
}

/**
 * Requires an admin API token (channel tokens get 403). The token also needs
 * `users_read` for GETs and `users_write` for everything else.
 *
 * Sudo users are read-only through this API: update/deactivate/activate/
 * delete/permission writes on a sudo user return 403. Sudo access can never
 * be granted through the API either — sending `sudo_access` to
 * updateSystemPermissions is a 422.
 */
export class Users extends BaseResource {
  list<T = any>(params: UserListParams = {}): Promise<T> {
    const query = compact({ limit: params.limit, offset: params.offset, q: params.q, status: params.status });
    return this.httpGet<T>('/api/v1/users', query);
  }

  get<T = any>(id: Id): Promise<T> {
    return this.httpGet<T>(`/api/v1/users/${id}`);
  }

  create<T = any>(attrs: UserCreateParams): Promise<T> {
    return this.httpPost<T>('/api/v1/users', { user: attrs });
  }

  update<T = any>(id: Id, attrs: UserUpdateParams): Promise<T> {
    return this.httpPatch<T>(`/api/v1/users/${id}`, { user: attrs });
  }

  deactivate<T = any>(id: Id): Promise<T> {
    return this.httpPost<T>(`/api/v1/users/${id}/deactivate`);
  }

  /** Also clears account lockout. */
  activate<T = any>(id: Id): Promise<T> {
    return this.httpPost<T>(`/api/v1/users/${id}/activate`);
  }

  delete<T = any>(id: Id): Promise<T> {
    return this.httpDelete<T>(`/api/v1/users/${id}`);
  }

  channelPermissions<T = any>(id: Id): Promise<T> {
    return this.httpGet<T>(`/api/v1/users/${id}/channel_permissions`);
  }

  /**
   * PUT replaces the whole channel permission record. Pass exactly one of
   * `permissions` (unlisted flags become false), `role`, or `presetId`.
   */
  async setChannelPermissions<T = any>(
    id: Id,
    broadcastChannelId: Id,
    write: ChannelPermissionWrite,
  ): Promise<T> {
    const body = channelPermissionWriteBody(write);
    return this.httpPut<T>(`/api/v1/users/${id}/channel_permissions/${broadcastChannelId}`, body);
  }

  removeChannelPermissions<T = any>(id: Id, broadcastChannelId: Id): Promise<T> {
    return this.httpDelete<T>(`/api/v1/users/${id}/channel_permissions/${broadcastChannelId}`);
  }

  /** Same exactly-one-of rule as setChannelPermissions, applied across `broadcastChannelIds`. */
  async bulkChannelPermissions<T = any>(id: Id, params: BulkChannelPermissionsParams): Promise<T> {
    const { broadcastChannelIds, ...write } = params;
    return this.httpPost<T>(`/api/v1/users/${id}/channel_permissions/bulk`, {
      broadcast_channel_ids: broadcastChannelIds,
      ...channelPermissionWriteBody(write),
    });
  }

  systemPermissions<T = any>(id: Id): Promise<T> {
    return this.httpGet<T>(`/api/v1/users/${id}/system_permissions`);
  }

  /** PATCH changes only the flags named; sudo_access can never be granted here. */
  updateSystemPermissions<T = any>(id: Id, permissions: Partial<SystemPermissions>): Promise<T> {
    return this.httpPatch<T>(`/api/v1/users/${id}/system_permissions`, { permissions });
  }
}

function channelPermissionWriteBody(write: ChannelPermissionWrite): Params {
  const given = (['permissions', 'role', 'presetId'] as const).filter((key) => write[key] !== undefined);

  if (given.length !== 1) {
    throw new TypeError(
      'setChannelPermissions/bulkChannelPermissions require exactly one of permissions, role, or presetId ' +
        `(got ${given.length}: ${given.join(', ') || 'none'})`,
    );
  }

  if (write.permissions !== undefined) return { permissions: write.permissions };
  if (write.role !== undefined) return { role: write.role };
  return { preset_id: write.presetId };
}
