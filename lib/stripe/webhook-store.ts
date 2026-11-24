/**
 * Stripe webhook event store (recreated — module was lost in a bad merge on
 * main). Persists raw Stripe webhook events for idempotent processing and
 * admin inspection. Falls back to an in-memory ring buffer when no database
 * is configured (e.g. local dev), sufficient for dedupe within a single
 * process lifetime.
 */

import { getPool } from '@/lib/db/client';

export interface StoredWebhookEvent {
  id: string;
  type: string;
  payload: unknown;
  receivedAt: string;
}

const MEMORY_LIMIT = 200;
const memoryEvents: StoredWebhookEvent[] = [];

export async function storeWebhookEvent(id: string, type: string, payload: unknown): Promise<void> {
  const event: StoredWebhookEvent = {
    id,
    type,
    payload,
    receivedAt: new Date().toISOString(),
  };

  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO stripe_webhook_events (id, type, payload, received_at)
       VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [id, type, JSON.stringify(payload)]
    );
  } catch (error) {
    // No table / no DB — keep the in-memory fallback.
    memoryEvents.push(event);
    if (memoryEvents.length > MEMORY_LIMIT) memoryEvents.shift();
    console.error('[stripe/webhook-store] persisted to memory only:', error);
  }
}

export async function getWebhookEvents(limit = 50): Promise<StoredWebhookEvent[]> {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, type, payload, received_at AS "receivedAt"
       FROM stripe_webhook_events ORDER BY received_at DESC LIMIT $1`,
      [limit]
    );
    return result.rows as StoredWebhookEvent[];
  } catch (error) {
    console.error('[stripe/webhook-store] reading from memory fallback:', error);
    return memoryEvents.slice(-limit).reverse();
  }
}

export async function hasWebhookEvent(id: string): Promise<boolean> {
  try {
    const pool = getPool();
    const result = await pool.query('SELECT 1 FROM stripe_webhook_events WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  } catch {
    return memoryEvents.some((event) => event.id === id);
  }
}
