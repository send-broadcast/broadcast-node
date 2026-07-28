import { ConfigurationError } from './errors.ts';

/**
 * How to handle the `warnings` array the API returns on successful writes:
 *   'log'    — warn through `logger` if one is set (default)
 *   'raise'  — throw WarningError; note the write already happened
 *   'ignore' — leave them on the response for the caller to inspect
 */
export type WarningsMode = 'log' | 'raise' | 'ignore';

export const WARNINGS_MODES: readonly WarningsMode[] = ['log', 'raise', 'ignore'];

/** Env vars use the same names as the Broadcast CLI's ~/.config/broadcast/config. */
export const ENV_HOST = 'BROADCAST_HOST';
export const ENV_TOKEN = 'BROADCAST_API_TOKEN';

export interface Logger {
  warn(message: string): void;
  debug?(message: string): void;
}

export interface ConfigurationOptions {
  apiToken?: string;
  host?: string;
  /** Read timeout in **milliseconds** (the Ruby gem uses seconds). */
  timeout?: number;
  /** Connect timeout in **milliseconds**. */
  openTimeout?: number;
  retryAttempts?: number;
  /** Base backoff in **milliseconds**, multiplied by the attempt number. */
  retryDelay?: number;
  /** Ceiling on a server-supplied Retry-After, in **milliseconds**. */
  maxRetryDelay?: number;
  warningsMode?: WarningsMode;
  logger?: Logger | null;
  debug?: boolean;
  broadcastChannelId?: string | number;
  /** Injectable for tests; defaults to globalThis.fetch. */
  fetch?: typeof globalThis.fetch;
  /** Injectable for tests, so retry backoff does not make the suite sleep. */
  sleep?: (ms: number) => Promise<void>;
}

export class Configuration {
  apiToken: string | undefined;
  host: string | undefined;
  timeout: number;
  openTimeout: number;
  retryAttempts: number;
  retryDelay: number;
  maxRetryDelay: number;
  warningsMode: WarningsMode;
  logger: Logger | null;
  debug: boolean;
  broadcastChannelId: string | number | undefined;
  fetch: typeof globalThis.fetch;
  sleep: (ms: number) => Promise<void>;

  constructor(options: ConfigurationOptions = {}) {
    this.apiToken = options.apiToken ?? process.env[ENV_TOKEN];
    // No default host. Broadcast is self-hosted-first — every instance lives at
    // its own domain, so any built-in guess is wrong for nearly everyone.
    this.host = options.host ?? process.env[ENV_HOST];

    // Durations are milliseconds here, seconds in the Ruby gem. Both are
    // idiomatic for their language; the wire behaviour is identical.
    this.timeout = options.timeout ?? 30_000;
    this.openTimeout = options.openTimeout ?? 10_000;
    this.retryAttempts = options.retryAttempts ?? 3;
    this.retryDelay = options.retryDelay ?? 1_000;
    this.maxRetryDelay = options.maxRetryDelay ?? 30_000;

    this.warningsMode = options.warningsMode ?? 'log';
    this.logger = options.logger ?? null;
    this.debug = options.debug ?? false;
    this.broadcastChannelId = options.broadcastChannelId;
    this.fetch = options.fetch ?? globalThis.fetch;
    this.sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  validate(): void {
    if (isBlank(this.apiToken)) {
      throw new ConfigurationError('api_token is required');
    }
    if (isBlank(this.host)) {
      throw new ConfigurationError(hostMissingMessage());
    }

    this.host = stripTrailingSlash(String(this.host).trim());
    this.validateHostScheme();
    this.validateWarningsMode();

    if (typeof this.fetch !== 'function') {
      throw new ConfigurationError(
        'No fetch implementation available. Node 18+ provides one natively; ' +
          'on older runtimes pass `fetch` explicitly.',
      );
    }
  }

  private validateHostScheme(): void {
    const host = String(this.host);
    if (host.startsWith('http://') || host.startsWith('https://')) return;

    throw new ConfigurationError(
      `host must include a scheme (http:// or https://), got ${JSON.stringify(host)}`,
    );
  }

  private validateWarningsMode(): void {
    if (WARNINGS_MODES.includes(this.warningsMode)) return;

    throw new ConfigurationError(
      `warnings_mode must be one of ${WARNINGS_MODES.join(', ')}, got ${JSON.stringify(this.warningsMode)}`,
    );
  }
}

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  // Anything that is not a string is a caller error rather than a blank value:
  // String({}) is "[object Object]", which would read as present and then fail
  // far away from the mistake.
  if (typeof value !== 'string') return false;

  return value.trim() === '';
}

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function hostMissingMessage(): string {
  return (
    "host is required — point it at your Broadcast instance, e.g. " +
    "new Broadcast({ apiToken: '...', host: 'https://mail.example.com' }). " +
    `You can also set the ${ENV_HOST} environment variable.`
  );
}
