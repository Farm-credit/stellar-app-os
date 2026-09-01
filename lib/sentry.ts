/**
 * Sentry error tracking — server side only.
 *
 * The Node SDK is initialised once per server process from the Next.js
 * `instrumentation.ts` hook. Its default integrations register
 * `process.on('uncaughtException')` and `process.on('unhandledRejection')`
 * listeners, so unhandled errors anywhere in the backend are reported without
 * per-call-site wiring. Errors that Next.js catches itself (route handlers,
 * server components, server actions, middleware) are forwarded explicitly via
 * `captureRequestError` from the `onRequestError` hook.
 *
 * With no `SENTRY_DSN` set — local development, CI, tests — every function here
 * degrades to a no-op, so nothing needs to branch on whether Sentry is enabled.
 */

import * as Sentry from '@sentry/node';

// ── Configuration ─────────────────────────────────────────────────────────────

/** The subset of `process.env` this module reads. */
export interface SentryEnv {
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;
  SENTRY_RELEASE?: string;
  SENTRY_TRACES_SAMPLE_RATE?: string;
  NODE_ENV?: string;
}

export interface SentryConfig {
  dsn: string;
  environment: string;
  release?: string;
  tracesSampleRate: number;
}

/** Tracing is opt-in — this integration exists for error tracking. */
const DEFAULT_TRACES_SAMPLE_RATE = 0;

/**
 * Parses `SENTRY_TRACES_SAMPLE_RATE`.
 *
 * Anything that is not a finite number within [0, 1] falls back to the default
 * instead of throwing, so a typo in a deployment environment can never stop the
 * server from booting.
 */
export function parseSampleRate(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_TRACES_SAMPLE_RATE;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return DEFAULT_TRACES_SAMPLE_RATE;

  return parsed;
}

/**
 * Builds the Sentry configuration from the environment, or returns null when no
 * DSN is configured — the normal case outside production.
 */
export function resolveSentryConfig(env: SentryEnv): SentryConfig | null {
  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn) return null;

  return {
    dsn,
    environment: env.SENTRY_ENVIRONMENT?.trim() || env.NODE_ENV || 'development',
    release: env.SENTRY_RELEASE?.trim() || undefined,
    tracesSampleRate: parseSampleRate(env.SENTRY_TRACES_SAMPLE_RATE),
  };
}

// ── Redaction ─────────────────────────────────────────────────────────────────

/** Headers that must never leave the server, matched case-insensitively. */
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'proxy-authorization',
  'x-api-key',
  'x-auth-token',
]);

const REDACTED = '[REDACTED]';

/** Replaces the value of every sensitive header, preserving the key set. */
export function scrubHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(headers)) {
    result[key] = SENSITIVE_HEADERS.has(key.toLowerCase()) ? REDACTED : value;
  }

  return result;
}

/**
 * Defence in depth for outbound events: Sentry runs with `sendDefaultPii: false`,
 * but request headers can still reach an event through explicit context, so they
 * are scrubbed here on the way out.
 */
export function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.request?.headers) {
    event.request.headers = scrubHeaders(event.request.headers) as Record<string, string>;
  }

  if (event.request?.cookies) {
    delete event.request.cookies;
  }

  return event;
}

// ── Initialisation ────────────────────────────────────────────────────────────

let initialized = false;

/**
 * Initialises the Sentry Node SDK.
 *
 * Idempotent — repeat calls are no-ops. Returns true when Sentry is active and
 * false when no DSN is configured, so the caller can log which happened.
 */
export function initSentry(env: SentryEnv = process.env): boolean {
  if (initialized) return true;

  const config = resolveSentryConfig(env);
  if (config === null) return false;

  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    tracesSampleRate: config.tracesSampleRate,
    // Never attach cookies, IP addresses or request bodies automatically.
    sendDefaultPii: false,
    beforeSend: (event) => scrubEvent(event),
  });

  initialized = true;
  return true;
}

/** True once `initSentry` has successfully configured the SDK. */
export function isSentryEnabled(): boolean {
  return initialized;
}

// ── Capture ───────────────────────────────────────────────────────────────────

/** Where a server-side error came from, as reported by Next.js. */
export interface RequestErrorContext {
  path: string;
  method: string;
  routePath?: string;
  routeType?: string;
  routerKind?: string;
}

/**
 * Reports an uncaught server-side request error, tagged with the route it came
 * from so errors group per route in Sentry.
 */
export function captureRequestError(error: unknown, context: RequestErrorContext): void {
  if (!initialized) return;

  Sentry.captureException(error, {
    tags: {
      method: context.method,
      route_path: context.routePath,
      route_type: context.routeType,
      router_kind: context.routerKind,
    },
    extra: { path: context.path },
  });
}

/**
 * Reports an error from anywhere else in the backend — workers, cron jobs,
 * background tasks. `extra` is attached to the event as-is, so do not pass
 * secrets or personal data.
 */
export function captureException(error: unknown, extra?: Record<string, unknown>): void {
  if (!initialized) return;

  Sentry.captureException(error, extra ? { extra } : undefined);
}

/**
 * Flushes queued events, for short-lived processes that would otherwise exit
 * before Sentry finishes its HTTP request. Resolves true when the queue drained
 * within `timeoutMs`.
 */
export function flushSentry(timeoutMs = 2_000): Promise<boolean> {
  if (!initialized) return Promise.resolve(true);

  return Sentry.flush(timeoutMs);
}
