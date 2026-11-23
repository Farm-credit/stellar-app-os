/**
 * Data access for the webhook dispatch system (migrations 007 + 031).
 *
 * Thin, hand-written SQL over the shared pg pool — consistent with the rest of
 * the codebase (no ORM). Takes a `Pool` so callers and tests control the
 * connection.
 */

import type { Pool } from 'pg';
import type {
  DeliveryStatus,
  SafeWebhookSubscriptionRow,
  WebhookDeliveryRow,
  WebhookSubscriptionRow,
} from './types';

const SAFE_SUBSCRIPTION_COLUMNS = `
  id,
  public_id,
  planter_id,
  client_id,
  api_key_id,
  owner_wallet,
  url,
  description,
  event_types,
  is_active,
  secret_last_four,
  secret_rotated_at,
  previous_secret_expires_at,
  consecutive_failures,
  last_delivery_at,
  last_delivery_status,
  disabled_at,
  disabled_reason,
  created_at,
  updated_at,
  deleted_at
`;

export interface WebhookDeliveryWithEndpointRow extends WebhookDeliveryRow {
  subscription_url?: string;
  subscription_public_id?: string | null;
}

/** Active, non-deleted subscriptions that want the given event type (includes secrets for dispatch). */
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

export interface InsertSubscriptionParams {
  planterId?: number | null;
  clientId?: string | null;
  apiKeyId?: number | null;
  ownerWallet?: string | null;
  description?: string | null;
  url: string;
  secret?: string | null;
  secretEncrypted?: string | null;
  secretLastFour?: string | null;
  eventTypes: string[];
  isActive?: boolean;
}

/** Register a new webhook subscription for an app or backend. Never returns secret columns. */
export async function insertSubscription(
  pool: Pool,
  params: InsertSubscriptionParams
): Promise<SafeWebhookSubscriptionRow> {
  const { rows } = await pool.query<SafeWebhookSubscriptionRow>(
    `INSERT INTO webhook_subscriptions
       (planter_id, client_id, api_key_id, owner_wallet, description, url, secret, secret_encrypted, secret_last_four, event_types, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING ${SAFE_SUBSCRIPTION_COLUMNS}`,
    [
      params.planterId ?? null,
      params.clientId ?? null,
      params.apiKeyId ?? null,
      params.ownerWallet ?? null,
      params.description ?? null,
      params.url,
      params.secret ?? null,
      params.secretEncrypted ?? null,
      params.secretLastFour ?? null,
      params.eventTypes,
      params.isActive ?? true,
    ]
  );
  return rows[0];
}

export async function listSubscriptions(
  pool: Pool,
  filter?: number | { planterId?: number; apiKeyId?: number; clientId?: string }
): Promise<SafeWebhookSubscriptionRow[]> {
  const normalized = typeof filter === 'number' ? { planterId: filter } : (filter ?? {});
  const conditions = ['deleted_at IS NULL'];
  const values: unknown[] = [];

  if (normalized.planterId !== undefined) {
    values.push(normalized.planterId);
    conditions.push(`planter_id = $${values.length}`);
  }
  if (normalized.apiKeyId !== undefined) {
    values.push(normalized.apiKeyId);
    conditions.push(`api_key_id = $${values.length}`);
  }
  if (normalized.clientId !== undefined) {
    values.push(normalized.clientId);
    conditions.push(`client_id = $${values.length}`);
  }

  const { rows } = await pool.query<SafeWebhookSubscriptionRow>(
    `SELECT ${SAFE_SUBSCRIPTION_COLUMNS}
       FROM webhook_subscriptions
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC`,
    values
  );
  return rows;
}

export async function getDeliveryById(pool: Pool, id: number): Promise<WebhookDeliveryRow | null> {
  const { rows } = await pool.query<WebhookDeliveryRow>(
    `SELECT * FROM webhook_deliveries WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

/** Public-safe projection without secret columns for API/UI callers. */
export async function getSubscriptionById(
  pool: Pool,
  id: number
): Promise<SafeWebhookSubscriptionRow | null> {
  const { rows } = await pool.query<SafeWebhookSubscriptionRow>(
    `SELECT ${SAFE_SUBSCRIPTION_COLUMNS}
       FROM webhook_subscriptions
      WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  return rows[0] ?? null;
}

/** Internal dispatch-only projection including encrypted/legacy secret material for HMAC signing. */
export async function getSubscriptionForDispatchById(
  pool: Pool,
  id: number
): Promise<WebhookSubscriptionRow | null> {
  const { rows } = await pool.query<WebhookSubscriptionRow>(
    `SELECT * FROM webhook_subscriptions WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function getSubscriptionByPublicId(
  pool: Pool,
  publicId: string,
  owner?: { apiKeyId?: number }
): Promise<SafeWebhookSubscriptionRow | null> {
  const conditions = ['public_id = $1', 'deleted_at IS NULL'];
  const values: unknown[] = [publicId];

  if (owner?.apiKeyId !== undefined) {
    values.push(owner.apiKeyId);
    conditions.push(`api_key_id = $${values.length}`);
  }

  const { rows } = await pool.query<SafeWebhookSubscriptionRow>(
    `SELECT ${SAFE_SUBSCRIPTION_COLUMNS}
       FROM webhook_subscriptions
      WHERE ${conditions.join(' AND ')}`,
    values
  );
  return rows[0] ?? null;
}

export interface UpdateSubscriptionParams {
  url?: string;
  eventTypes?: string[];
  description?: string | null;
  isActive?: boolean;
}

export async function updateSubscription(
  pool: Pool,
  selector: { id?: number; publicId?: string; apiKeyId?: number },
  updates: UpdateSubscriptionParams
): Promise<SafeWebhookSubscriptionRow | null> {
  const sets: string[] = ['updated_at = NOW()'];
  const values: unknown[] = [];

  if (updates.url !== undefined) {
    values.push(updates.url);
    sets.push(`url = $${values.length}`);
  }
  if (updates.eventTypes !== undefined) {
    values.push(updates.eventTypes);
    sets.push(`event_types = $${values.length}`);
  }
  if (updates.description !== undefined) {
    values.push(updates.description);
    sets.push(`description = $${values.length}`);
  }
  if (updates.isActive !== undefined) {
    values.push(updates.isActive);
    sets.push(`is_active = $${values.length}`);
    if (updates.isActive) {
      sets.push('consecutive_failures = 0', 'disabled_at = NULL', 'disabled_reason = NULL');
    }
  }

  const where: string[] = ['deleted_at IS NULL'];
  if (selector.id !== undefined) {
    values.push(selector.id);
    where.push(`id = $${values.length}`);
  }
  if (selector.publicId !== undefined) {
    values.push(selector.publicId);
    where.push(`public_id = $${values.length}`);
  }
  if (selector.apiKeyId !== undefined) {
    values.push(selector.apiKeyId);
    where.push(`api_key_id = $${values.length}`);
  }

  const { rows } = await pool.query<SafeWebhookSubscriptionRow>(
    `UPDATE webhook_subscriptions
        SET ${sets.join(', ')}
      WHERE ${where.join(' AND ')}
      RETURNING ${SAFE_SUBSCRIPTION_COLUMNS}`,
    values
  );
  return rows[0] ?? null;
}

export async function softDeleteSubscription(
  pool: Pool,
  selector: { id?: number; publicId?: string; apiKeyId?: number }
): Promise<boolean> {
  const where: string[] = ['deleted_at IS NULL'];
  const values: unknown[] = [];

  if (selector.id !== undefined) {
    values.push(selector.id);
    where.push(`id = $${values.length}`);
  }
  if (selector.publicId !== undefined) {
    values.push(selector.publicId);
    where.push(`public_id = $${values.length}`);
  }
  if (selector.apiKeyId !== undefined) {
    values.push(selector.apiKeyId);
    where.push(`api_key_id = $${values.length}`);
  }

  const { rowCount } = await pool.query(
    `UPDATE webhook_subscriptions
        SET deleted_at = NOW(),
            is_active = FALSE,
            updated_at = NOW()
      WHERE ${where.join(' AND ')}`,
    values
  );
  return (rowCount ?? 0) > 0;
}

export async function rotateSubscriptionSecret(
  pool: Pool,
  selector: { id?: number; publicId?: string; apiKeyId?: number },
  params: {
    secretEncrypted: string;
    secretLastFour: string;
    previousSecretExpiresAt: Date;
  }
): Promise<SafeWebhookSubscriptionRow | null> {
  const values: unknown[] = [
    params.secretEncrypted,
    params.secretLastFour,
    params.previousSecretExpiresAt,
  ];
  const where: string[] = ['deleted_at IS NULL'];

  if (selector.id !== undefined) {
    values.push(selector.id);
    where.push(`id = $${values.length}`);
  }
  if (selector.publicId !== undefined) {
    values.push(selector.publicId);
    where.push(`public_id = $${values.length}`);
  }
  if (selector.apiKeyId !== undefined) {
    values.push(selector.apiKeyId);
    where.push(`api_key_id = $${values.length}`);
  }

  const { rows } = await pool.query<SafeWebhookSubscriptionRow>(
    `UPDATE webhook_subscriptions
        SET previous_secret_encrypted  = secret_encrypted,
            previous_secret_expires_at = $3,
            secret_encrypted           = $1,
            secret_last_four           = $2,
            secret                     = NULL,
            secret_rotated_at          = NOW(),
            updated_at                 = NOW()
      WHERE ${where.join(' AND ')}
      RETURNING ${SAFE_SUBSCRIPTION_COLUMNS}`,
    values
  );
  return rows[0] ?? null;
}

export interface ListDeliveriesFilter {
  subscriptionId?: number;
  subscriptionPublicId?: string;
  apiKeyId?: number;
  status?: string;
  eventType?: string;
  limit?: number;
  offset?: number;
}

export async function listDeliveries(
  pool: Pool,
  filters: ListDeliveriesFilter = {}
): Promise<WebhookDeliveryWithEndpointRow[]> {
  const where: string[] = ['1=1'];
  const values: unknown[] = [];

  if (filters.subscriptionId !== undefined) {
    values.push(filters.subscriptionId);
    where.push(`d.subscription_id = $${values.length}`);
  }
  if (filters.subscriptionPublicId !== undefined) {
    values.push(filters.subscriptionPublicId);
    where.push(`s.public_id = $${values.length}`);
  }
  if (filters.apiKeyId !== undefined) {
    values.push(filters.apiKeyId);
    where.push(`s.api_key_id = $${values.length}`);
  }
  if (filters.status && filters.status !== 'all') {
    values.push(filters.status);
    where.push(`d.status = $${values.length}::webhook_delivery_status`);
  }
  if (filters.eventType && filters.eventType !== 'all') {
    values.push(filters.eventType);
    where.push(`d.event_type = $${values.length}`);
  }

  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const offset = Math.max(filters.offset ?? 0, 0);
  values.push(limit, offset);

  const { rows } = await pool.query<WebhookDeliveryWithEndpointRow>(
    `SELECT d.*,
            s.url AS subscription_url,
            s.public_id AS subscription_public_id
       FROM webhook_deliveries d
       JOIN webhook_subscriptions s ON s.id = d.subscription_id
      WHERE ${where.join(' AND ')}
      ORDER BY d.created_at DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  return rows;
}

/**
 * Deliveries whose scheduled retry time has arrived. Uses FOR UPDATE SKIP
 * LOCKED so multiple processor invocations can run concurrently without
 * double-dispatching the same row.
 */
export async function claimDueDeliveries(
  pool: Pool,
  limit: number,
  now: Date = new Date(),
  leaseMs = 60_000
): Promise<WebhookDeliveryRow[]> {
  const leaseUntil = new Date(now.getTime() + leaseMs);
  const { rows } = await pool.query<WebhookDeliveryRow>(
    `WITH due AS (
       SELECT id
         FROM webhook_deliveries
        WHERE status = 'retrying'
          AND next_attempt_at IS NOT NULL
          AND next_attempt_at <= $1
          AND attempt_count < max_attempts
        ORDER BY next_attempt_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
     )
     UPDATE webhook_deliveries AS delivery
        SET next_attempt_at = $3,
            updated_at = NOW()
       FROM due
      WHERE delivery.id = due.id
      RETURNING delivery.*`,
    [now, limit, leaseUntil]
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
  durationMs?: number | null;
  failedAt?: Date | null;
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
            duration_ms     = COALESCE($9, duration_ms),
            failed_at       = COALESCE($10, failed_at),
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
      params.durationMs ?? null,
      params.failedAt ?? null,
    ]
  );
  return rows[0];
}

/** Track endpoint health & auto-disable consistently failing subscriptions. */
export async function recordSubscriptionDeliveryHealth(
  pool: Pool,
  params: {
    subscriptionId: number;
    success: boolean;
    terminalFailure: boolean;
    status: DeliveryStatus;
    autoDisableThreshold: number;
  }
): Promise<void> {
  if (params.success) {
    await pool.query(
      `UPDATE webhook_subscriptions
          SET consecutive_failures = 0,
              last_delivery_at     = NOW(),
              last_delivery_status = $2::webhook_delivery_status,
              updated_at           = NOW()
        WHERE id = $1`,
      [params.subscriptionId, params.status]
    );
    return;
  }

  if (params.terminalFailure) {
    await pool.query(
      `UPDATE webhook_subscriptions
          SET consecutive_failures = consecutive_failures + 1,
              last_delivery_at     = NOW(),
              last_delivery_status = $2::webhook_delivery_status,
              is_active            = CASE
                                       WHEN consecutive_failures + 1 >= $3 THEN FALSE
                                       ELSE is_active
                                     END,
              disabled_at          = CASE
                                       WHEN consecutive_failures + 1 >= $3 AND disabled_at IS NULL THEN NOW()
                                       ELSE disabled_at
                                     END,
              disabled_reason      = CASE
                                       WHEN consecutive_failures + 1 >= $3 THEN 'Exceeded consecutive failure threshold'
                                       ELSE disabled_reason
                                     END,
              updated_at           = NOW()
        WHERE id = $1`,
      [params.subscriptionId, params.status, params.autoDisableThreshold]
    );
    return;
  }

  await pool.query(
    `UPDATE webhook_subscriptions
        SET last_delivery_at     = NOW(),
            last_delivery_status = $2::webhook_delivery_status,
            updated_at           = NOW()
      WHERE id = $1`,
    [params.subscriptionId, params.status]
  );
}
