/**
 * Outward webhook dispatch service.
 *
 * Responsibilities:
 *   • POST signed JSON notifications to planter backends (`deliver`)
 *   • Fan an event out to every matching subscription (`dispatchEvent`)
 *   • Retry failed attempts with exponential backoff (`processDueDeliveries`,
 *     `retryDelivery`)
 *
 * The HTTP send (`deliver`) is pure and pool-free so it can be unit-tested with
 * a mocked `fetch`. Everything that touches Postgres goes through `repository`.
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
  getSubscriptionById,
  insertDelivery,
  recordAttemptResult,
} from './repository';
import { buildSignatureHeaders } from './signature';
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

// ── Low-level HTTP send ───────────────────────────────────────────────────────

/**
 * Sign and POST one envelope to a single endpoint. Never throws — network and
 * timeout failures are returned as `{ ok: false }`.
 */
export async function deliver(
  url: string,
  secret: string,
  envelope: WebhookEnvelope,
  timeoutMs: number = getDispatchConfig().timeoutMs
): Promise<AttemptResult> {
  const rawBody = JSON.stringify(envelope);
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Harvesta-Webhooks/1',
    ...buildSignatureHeaders(rawBody, secret, envelope.id),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: rawBody,
      signal: controller.signal,
    });

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
    };
  } catch (err) {
    const error =
      err instanceof Error
        ? err.name === 'AbortError'
          ? `Request timed out after ${timeoutMs}ms`
          : err.message
        : 'Unknown delivery error';
    return { ok: false, httpStatus: null, responseBody: null, error };
  } finally {
    clearTimeout(timer);
  }
}

// ── Attempt orchestration (HTTP + persistence) ────────────────────────────────

/**
 * Perform one delivery attempt for a row, persist the outcome, and schedule the
 * next retry with exponential backoff if this attempt failed and budget remains.
 * Returns the updated row.
 */
export async function attemptDelivery(
  pool: Pool,
  delivery: WebhookDeliveryRow,
  subscription: WebhookSubscriptionRow
): Promise<WebhookDeliveryRow> {
  const config = getDispatchConfig();
  const envelope = buildEnvelope(delivery);
  const result = await deliver(subscription.url, subscription.secret, envelope, config.timeoutMs);

  const attemptCount = delivery.attempt_count + 1;

  if (result.ok) {
    return recordAttemptResult(pool, {
      deliveryId: delivery.id,
      status: 'success',
      attemptCount,
      httpStatus: result.httpStatus,
      responseBody: result.responseBody,
      errorMessage: null,
      nextAttemptAt: null,
      deliveredAt: new Date(),
    });
  }

  // Failed. Schedule another retry unless we've exhausted the budget.
  const retriesRemaining = attemptCount < delivery.max_attempts;
  const nextAttemptAt = retriesRemaining
    ? new Date(
        Date.now() +
          computeBackoffMs(attemptCount, {
            baseDelayMs: config.baseDelayMs,
            maxDelayMs: config.maxDelayMs,
          })
      )
    : null;

  return recordAttemptResult(pool, {
    deliveryId: delivery.id,
    status: retriesRemaining ? 'retrying' : 'failed',
    attemptCount,
    httpStatus: result.httpStatus,
    responseBody: result.responseBody,
    errorMessage: result.error,
    nextAttemptAt,
    deliveredAt: null,
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fan an event out to all matching active subscriptions: create a delivery row
 * for each and attempt the first delivery immediately. Failed sends are left in
 * 'retrying' state for the backoff processor to pick up. Returns one delivery
 * row per targeted subscription.
 */
export async function dispatchEvent(
  pool: Pool,
  eventType: DispatchEventType,
  payload: Record<string, unknown>
): Promise<WebhookDeliveryRow[]> {
  const config = getDispatchConfig();
  const subscriptions = await getActiveSubscriptionsForEvent(pool, eventType);

  const results: WebhookDeliveryRow[] = [];
  for (const subscription of subscriptions) {
    const delivery = await insertDelivery(pool, {
      subscriptionId: subscription.id,
      eventType,
      payload,
      maxAttempts: config.maxAttempts,
    });
    results.push(await attemptDelivery(pool, delivery, subscription));
  }
  return results;
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
  deliveryId: number
): Promise<WebhookDeliveryRow | null> {
  const delivery = await getDeliveryById(pool, deliveryId);
  if (!delivery || !isRetryable(delivery)) {
    return null;
  }
  const subscription = await getSubscriptionById(pool, delivery.subscription_id);
  if (!subscription) {
    return null;
  }
  return attemptDelivery(pool, delivery, subscription);
}

/**
 * Process all deliveries whose backoff timer has elapsed. Intended to be called
 * on a schedule (cron / worker). Returns the rows after their retry attempt.
 */
export async function processDueDeliveries(
  pool: Pool,
  now: Date = new Date()
): Promise<WebhookDeliveryRow[]> {
  const config = getDispatchConfig();
  const due = await claimDueDeliveries(pool, config.batchSize, now);

  const processed: WebhookDeliveryRow[] = [];
  for (const delivery of due) {
    const subscription = await getSubscriptionById(pool, delivery.subscription_id);
    if (!subscription || !subscription.is_active) {
      continue;
    }
    processed.push(await attemptDelivery(pool, delivery, subscription));
  }
  return processed;
}
