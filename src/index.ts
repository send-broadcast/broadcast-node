export { Broadcast } from './client.ts';
export { Broadcast as BroadcastClient } from './client.ts';

export { Configuration, WARNINGS_MODES, ENV_HOST, ENV_TOKEN } from './configuration.ts';
export type { ConfigurationOptions, WarningsMode, Logger } from './configuration.ts';

export { meta, Warning } from './response.ts';
export type { ResponseMeta, RateLimit } from './response.ts';

export {
  BroadcastError,
  ConfigurationError,
  APIError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ValidationError,
  TimeoutError,
  DeliveryError,
  WarningError,
} from './errors.ts';

export {
  Webhook,
  EVENT_TYPES,
  EMAIL_EVENTS,
  SUBSCRIBER_EVENTS,
  BROADCAST_EVENTS,
  SEQUENCE_EVENTS,
  SYSTEM_EVENTS,
  TIMESTAMP_TOLERANCE,
} from './webhook.ts';
export type { EventType } from './webhook.ts';

export { VERSION } from './version.ts';

export { REDACTED_FIELDS } from './resources/email-servers.ts';
export { COLLECTIONS, type CollectionName } from './resources/migration.ts';
export { MAX_IDEMPOTENCY_KEY_LENGTH } from './resources/transactionals.ts';

export type { SubscriberListParams, SubscriberCreateParams, DoubleOptInOptions } from './resources/subscribers.ts';
export type { TransactionalCreateParams } from './resources/transactionals.ts';
export type { TemplateParams } from './resources/templates.ts';
export type { AutopilotParams } from './resources/autopilots.ts';
export type { ScheduleParams } from './resources/broadcasts.ts';
export type { AnalyticsParams } from './resources/opt-in-forms.ts';
export type {
  User,
  UserDetail,
  UserListParams,
  UserCreateParams,
  UserUpdateParams,
  ChannelPermission,
  ChannelPermissionWrite,
  BulkChannelPermissionsParams,
  BulkChannelPermissionsResult,
  SystemPermissions,
} from './resources/users.ts';

import { Broadcast } from './client.ts';
export default Broadcast;
