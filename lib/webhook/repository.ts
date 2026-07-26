/**
 * Data access for the webhook dispatch system (migration 007).
 *
 * Thin, hand-written SQL over the shared pg pool — consistent with the rest of
 * the codebase (no ORM). Takes a `Pool` so callers and tests control the
 * connection.
 */

import type { Pool } from 'pg';
import type { DeliveryStatus, WebhookDeliveryRow, WebhookSubscriptionRow } from './types';

/** Active, non-deleted subscriptions that want the given event type. */
export async function getActiveSubscriptionsForEvent(
  pool: Pool,
  eventType: string
): Promise<WebhookSubscriptionRow[]> {
  // event_types = '{}' means "all events"; otherwise the type must be a member.
  const { rows } = await pool.query<WebhookSubscriptionRow>(
    `SELECT *
       FROM webhook_subscriptions
      WHERE is_active = TRUE
        AND deleted_at IS NULL
        AND (cardinality(event_types) = 0 OR $1 = ANY (event_types))`,
    [eventType]
  );
  return rows;
}

/** Insert a fresh delivery row (status 'pending', no attempts yet). */
export async function insertDelivery(
  pool: Pool,
  params: {
    subscriptionId: number;
    eventType: string;
    payload: Record<string, unknown>;
    maxAttempts: number;
  }
): Promise<WebhookDeliveryRow> {
  const { rows } = await pool.query<WebhookDeliveryRow>(
    `INSERT INTO webhook_deliveries
       (subscription_id, event_type, payload, max_attempts)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [params.subscriptionId, params.eventType, JSON.stringify(params.payload), params.maxAttempts]
  );
  return rows[0];
}

export async function getDeliveryById(pool: Pool, id: number): Promise<WebhookDeliveryRow | null> {
  const { rows } = await pool.query<WebhookDeliveryRow>(
    `SELECT * FROM webhook_deliveries WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function getSubscriptionById(
  pool: Pool,
  id: number
): Promise<WebhookSubscriptionRow | null> {
  const { rows } = await pool.query<WebhookSubscriptionRow>(
    `SELECT * FROM webhook_subscriptions WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

/**
 * Deliveries whose scheduled retry time has arrived. Uses FOR UPDATE SKIP
 * LOCKED so multiple processor invocations can run concurrently without
 * double-dispatching the same row.
 */
export async function claimDueDeliveries(
  pool: Pool,
  limit: number,
  now: Date = new Date()
): Promise<WebhookDeliveryRow[]> {
  const { rows } = await pool.query<WebhookDeliveryRow>(
    `SELECT *
       FROM webhook_deliveries
      WHERE status = 'retrying'
        AND next_attempt_at IS NOT NULL
        AND next_attempt_at <= $1
        AND attempt_count < max_attempts
      ORDER BY next_attempt_at ASC
      LIMIT $2
      FOR UPDATE SKIP LOCKED`,
    [now, limit]
  );
  return rows;
}

export interface RecordAttemptParams {
  deliveryId: number;
  status: DeliveryStatus;
  attemptCount: number;
  httpStatus: number | null;
  responseBody: string | null;
  errorMessage: string | null;
  /** Set when scheduling another retry; null for terminal states. */
  nextAttemptAt: Date | null;
  /** Set on first success. */
  deliveredAt: Date | null;
}

/** Persist the outcome of an attempt and advance the delivery's state. */
export async function recordAttemptResult(
  pool: Pool,
  params: RecordAttemptParams
): Promise<WebhookDeliveryRow> {
  const { rows } = await pool.query<WebhookDeliveryRow>(
    `UPDATE webhook_deliveries
        SET status          = $2,
            attempt_count   = $3,
            http_status     = $4,
            response_body   = $5,
            error_message   = $6,
            next_attempt_at = $7,
            delivered_at    = COALESCE(delivered_at, $8),
            updated_at      = NOW()
      WHERE id = $1
      RETURNING *`,
    [
      params.deliveryId,
      params.status,
      params.attemptCount,
      params.httpStatus,
      params.responseBody,
      params.errorMessage,
      params.nextAttemptAt,
      params.deliveredAt,
    ]
  );
  return rows[0];
}
