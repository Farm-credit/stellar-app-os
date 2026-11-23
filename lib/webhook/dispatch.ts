/**
 * Outward webhook dispatch service.
 *
 * Responsibilities:
 *   • Validate destination URL against SSRF (`validateWebhookUrl`) and POST
 *     signed JSON notifications (`deliver`)
 *   • Fan an event out to every matching subscription (`dispatchEvent`)
 *   • Retry failed attempts with exponential backoff (`processDueDeliveries`,
 *     `retryDelivery`)
 */

import type { Pool } from 'pg';
import {
  computeBackoffMs,
  DEFAULT_BASE_DELAY_MS,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_MAX_DELAY_MS,
} from './backoff';
import {
  claimDueDeliveries,
  getActiveSubscriptionsForEvent,
  getDeliveryById,
  getSubscriptionForDispatchById,
  insertDelivery,
  recordAttemptResult,
  recordSubscriptionDeliveryHealth,
} from './repository';
import { decryptWebhookSecret } from './secrets';
import { buildSignatureHeaders } from './signature';
import { type DnsLookupFn, validateWebhookUrl, WebhookUrlValidationError } from './ssrf';
import type {
  AttemptResult,
  DispatchEventType,
  WebhookDeliveryRow,
  WebhookEnvelope,
  WebhookSubscriptionRow,
} from './types';

// ── Configuration (env-overridable, sensible defaults) ────────────────────────

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function getDispatchConfig() {
  return {
    timeoutMs: intFromEnv('WEBHOOK_TIMEOUT_MS', 10_000),
    maxAttempts: intFromEnv('WEBHOOK_MAX_ATTEMPTS', DEFAULT_MAX_ATTEMPTS),
    baseDelayMs: intFromEnv('WEBHOOK_BASE_DELAY_MS', DEFAULT_BASE_DELAY_MS),
    maxDelayMs: intFromEnv('WEBHOOK_MAX_DELAY_MS', DEFAULT_MAX_DELAY_MS),
    /** Max deliveries pulled per processor run. */
    batchSize: intFromEnv('WEBHOOK_BATCH_SIZE', 50),
    concurrency: intFromEnv('WEBHOOK_DISPATCH_CONCURRENCY', 5),
    autoDisableThreshold: intFromEnv('WEBHOOK_AUTO_DISABLE_THRESHOLD', 10),
  };
}

// ── Envelope ──────────────────────────────────────────────────────────────────

/** Build the wire envelope from a stored delivery row (stable across retries). */
export function buildEnvelope(delivery: WebhookDeliveryRow): WebhookEnvelope {
  return {
    id: delivery.event_id,
    type: delivery.event_type as DispatchEventType,
    createdAt: new Date(delivery.created_at).toISOString(),
    data: delivery.payload,
  };
}

// ── Secret Resolution ─────────────────────────────────────────────────────────

export function resolveSubscriptionSigningSecrets(
  subscription: Pick<
    WebhookSubscriptionRow,
    'secret' | 'secret_encrypted' | 'previous_secret_encrypted' | 'previous_secret_expires_at'
  >,
  now: Date = new Date()
): { activeSecret: string; previousSecret: string | null } {
  const activeSecret = subscription.secret_encrypted
    ? decryptWebhookSecret(subscription.secret_encrypted)
    : subscription.secret;

  if (!activeSecret) {
    throw new Error('Subscription has no signing secret configured.');
  }

  let previousSecret: string | null = null;
  if (subscription.previous_secret_encrypted && subscription.previous_secret_expires_at) {
    const expiresAt = new Date(subscription.previous_secret_expires_at);
    if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() > now.getTime()) {
      previousSecret = decryptWebhookSecret(subscription.previous_secret_encrypted);
    }
  }

  return { activeSecret, previousSecret };
}

// ── Low-level HTTP send ───────────────────────────────────────────────────────

export interface DeliverOptions {
  timeoutMs?: number;
  previousSecret?: string | null;
  dnsLookup?: DnsLookupFn;
  allowHttpLocalhost?: boolean;
  skipUrlValidation?: boolean;
}

export interface ExtendedAttemptResult extends AttemptResult {
  durationMs: number;
}

/**
 * Sign and POST one envelope to a single endpoint. Never throws — SSRF,
 * network, redirect, and timeout failures are returned as `{ ok: false }`.
 */
export async function deliver(
  url: string,
  secret: string,
  envelope: WebhookEnvelope,
  timeoutMsOrOptions: number | DeliverOptions = getDispatchConfig().timeoutMs
): Promise<ExtendedAttemptResult> {
  const opts: DeliverOptions =
    typeof timeoutMsOrOptions === 'number' ? { timeoutMs: timeoutMsOrOptions } : timeoutMsOrOptions;

  const timeoutMs = opts.timeoutMs ?? getDispatchConfig().timeoutMs;
  const startedAt = Date.now();

  if (!opts.skipUrlValidation) {
    try {
      await validateWebhookUrl(url, {
        allowHttpLocalhost: opts.allowHttpLocalhost ?? process.env.NODE_ENV !== 'production',
        dnsLookup: opts.dnsLookup,
      });
    } catch (err) {
      const error =
        err instanceof WebhookUrlValidationError
          ? `SSRF validation failed: ${err.message}`
          : err instanceof Error
            ? err.message
            : 'Invalid webhook URL';
      return {
        ok: false,
        httpStatus: null,
        responseBody: null,
        error,
        durationMs: Date.now() - startedAt,
      };
    }
  }

  const rawBody = JSON.stringify(envelope);
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Harvesta-Webhooks/1',
    'X-Webhook-Event': envelope.type,
    ...buildSignatureHeaders(rawBody, secret, envelope.id, undefined, opts.previousSecret),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: rawBody,
      redirect: 'manual',
      signal: controller.signal,
    });

    if (res.status >= 300 && res.status < 400) {
      return {
        ok: false,
        httpStatus: res.status,
        responseBody: null,
        error: `Endpoint returned disallowed redirect ${res.status}`,
        durationMs: Date.now() - startedAt,
      };
    }

    // Read body best-effort for diagnostics; cap to keep rows small.
    let responseBody: string | null = null;
    try {
      responseBody = (await res.text()).slice(0, 2000);
    } catch {
      responseBody = null;
    }

    return {
      ok: res.ok, // 2xx
      httpStatus: res.status,
      responseBody,
      error: res.ok ? null : `Endpoint responded ${res.status}`,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    const error =
      err instanceof Error
        ? err.name === 'AbortError'
          ? `Request timed out after ${timeoutMs}ms`
          : err.message
        : 'Unknown delivery error';
    return {
      ok: false,
      httpStatus: null,
      responseBody: null,
      error,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ── Attempt orchestration (HTTP + persistence) ────────────────────────────────

export interface DispatchRuntimeOptions {
  dnsLookup?: DnsLookupFn;
  allowHttpLocalhost?: boolean;
}

/**
 * Perform one delivery attempt for a row, persist the outcome, and schedule the
 * next retry with exponential backoff if this attempt failed and budget remains.
 * Returns the updated row.
 */
export async function attemptDelivery(
  pool: Pool,
  delivery: WebhookDeliveryRow,
  subscription: WebhookSubscriptionRow,
  runtimeOptions: DispatchRuntimeOptions = {}
): Promise<WebhookDeliveryRow> {
  const config = getDispatchConfig();
  const envelope = buildEnvelope(delivery);

  let activeSecret: string;
  let previousSecret: string | null = null;
  try {
    const resolved = resolveSubscriptionSigningSecrets(subscription);
    activeSecret = resolved.activeSecret;
    previousSecret = resolved.previousSecret;
  } catch (err) {
    const attemptCount = delivery.attempt_count + 1;
    const message = err instanceof Error ? err.message : 'Unable to resolve signing secret';
    const updated = await recordAttemptResult(pool, {
      deliveryId: delivery.id,
      status: 'failed',
      attemptCount,
      httpStatus: null,
      responseBody: null,
      errorMessage: message,
      nextAttemptAt: null,
      deliveredAt: null,
      failedAt: new Date(),
    });
    await recordSubscriptionHealthBestEffort(
      pool,
      subscription.id,
      false,
      true,
      'failed',
      config.autoDisableThreshold
    );
    return updated;
  }

  const result = await deliver(subscription.url, activeSecret, envelope, {
    timeoutMs: config.timeoutMs,
    previousSecret,
    dnsLookup: runtimeOptions.dnsLookup,
    allowHttpLocalhost: runtimeOptions.allowHttpLocalhost,
  });

  const attemptCount = delivery.attempt_count + 1;

  if (result.ok) {
    const updated = await recordAttemptResult(pool, {
      deliveryId: delivery.id,
      status: 'success',
      attemptCount,
      httpStatus: result.httpStatus,
      responseBody: result.responseBody,
      errorMessage: null,
      nextAttemptAt: null,
      deliveredAt: new Date(),
      durationMs: result.durationMs,
    });
    await recordSubscriptionHealthBestEffort(
      pool,
      subscription.id,
      true,
      false,
      'success',
      config.autoDisableThreshold
    );
    return updated;
  }

  // HTTP 410 Gone means the endpoint permanently no longer exists — stop retrying immediately.
  const isPermanentGone = result.httpStatus === 410;
  const retriesRemaining = !isPermanentGone && attemptCount < delivery.max_attempts;
  const nextAttemptAt = retriesRemaining
    ? new Date(
        Date.now() +
          computeBackoffMs(attemptCount, {
            baseDelayMs: config.baseDelayMs,
            maxDelayMs: config.maxDelayMs,
          })
      )
    : null;

  const status = retriesRemaining ? 'retrying' : 'failed';
  const updated = await recordAttemptResult(pool, {
    deliveryId: delivery.id,
    status,
    attemptCount,
    httpStatus: result.httpStatus,
    responseBody: result.responseBody,
    errorMessage: result.error,
    nextAttemptAt,
    deliveredAt: null,
    durationMs: result.durationMs,
    failedAt: retriesRemaining ? null : new Date(),
  });

  await recordSubscriptionHealthBestEffort(
    pool,
    subscription.id,
    false,
    !retriesRemaining,
    status,
    config.autoDisableThreshold
  );

  return updated;
}

async function recordSubscriptionHealthBestEffort(
  pool: Pool,
  subscriptionId: number,
  success: boolean,
  terminalFailure: boolean,
  status: 'pending' | 'retrying' | 'success' | 'failed',
  autoDisableThreshold: number
): Promise<void> {
  try {
    if (typeof recordSubscriptionDeliveryHealth === 'function') {
      await recordSubscriptionDeliveryHealth(pool, {
        subscriptionId,
        success,
        terminalFailure,
        status,
        autoDisableThreshold,
      });
    }
  } catch {
    // Health accounting must never fail a delivery attempt.
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  const limit = Math.max(1, concurrency);
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit);
    const settled = await Promise.allSettled(chunk.map((item) => worker(item)));
    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        results.push(outcome.value);
      }
    }
  }
  return results;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fan an event out to all matching active subscriptions: create a delivery row
 * for each and attempt the first delivery with bounded concurrency.
 */
export async function dispatchEvent(
  pool: Pool,
  eventType: DispatchEventType,
  payload: Record<string, unknown>,
  runtimeOptions: DispatchRuntimeOptions = {}
): Promise<WebhookDeliveryRow[]> {
  const config = getDispatchConfig();
  const subscriptions = await getActiveSubscriptionsForEvent(pool, eventType);

  return runWithConcurrency(subscriptions, config.concurrency, async (subscription) => {
    const delivery = await insertDelivery(pool, {
      subscriptionId: subscription.id,
      eventType,
      payload,
      maxAttempts: config.maxAttempts,
    });
    return attemptDelivery(pool, delivery, subscription, runtimeOptions);
  });
}

/** Whether a delivery is still eligible for (re)delivery. */
export function isRetryable(delivery: WebhookDeliveryRow): boolean {
  return delivery.status !== 'success' && delivery.attempt_count < delivery.max_attempts;
}

/**
 * Manually retry a single delivery (e.g. from the admin viewer). Returns the
 * updated row, or null if the delivery / subscription no longer exists or the
 * delivery is not retryable.
 */
export async function retryDelivery(
  pool: Pool,
  deliveryId: number,
  runtimeOptions: DispatchRuntimeOptions = {}
): Promise<WebhookDeliveryRow | null> {
  const delivery = await getDeliveryById(pool, deliveryId);
  if (!delivery || !isRetryable(delivery)) {
    return null;
  }
  const subscription = await getSubscriptionForDispatchById(pool, delivery.subscription_id);
  if (!subscription) {
    return null;
  }
  return attemptDelivery(pool, delivery, subscription, runtimeOptions);
}

/**
 * Process all deliveries whose backoff timer has elapsed. Intended to be called
 * on a schedule (cron / worker). Returns the rows after their retry attempt.
 */
export async function processDueDeliveries(
  pool: Pool,
  now: Date = new Date(),
  runtimeOptions: DispatchRuntimeOptions = {}
): Promise<WebhookDeliveryRow[]> {
  const config = getDispatchConfig();
  const claimLeaseMs = Math.max(config.timeoutMs + 30_000, 60_000);
  const due = await claimDueDeliveries(pool, config.batchSize, now, claimLeaseMs);

  return runWithConcurrency(due, config.concurrency, async (delivery) => {
    const subscription = await getSubscriptionForDispatchById(pool, delivery.subscription_id);
    if (!subscription || !subscription.is_active || subscription.deleted_at !== null) {
      // Transition to terminal 'failed' so inactive/deleted subscriptions do not re-claim forever.
      return recordAttemptResult(pool, {
        deliveryId: delivery.id,
        status: 'failed',
        attemptCount: delivery.attempt_count,
        httpStatus: null,
        responseBody: null,
        errorMessage: 'Subscription inactive or deleted',
        nextAttemptAt: null,
        deliveredAt: null,
        failedAt: new Date(),
      });
    }
    return attemptDelivery(pool, delivery, subscription, runtimeOptions);
  });
}
