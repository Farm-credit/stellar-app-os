/**
 * High-level event emitters that translate platform actions into webhook
 * dispatches. Keep call sites (API routes, workers) free of dispatch plumbing.
 */

import { getPool } from '@/lib/db/client';
import { dispatchEvent } from './dispatch';
import type { MilestonePayoutApprovedPayload, WebhookDeliveryRow } from './types';

/**
 * Emit `milestone.payout.approved` after a milestone escrow release is confirmed
 * on-chain.
 *
 * This is intentionally best-effort and self-contained: a webhook failure must
 * never roll back or fail the on-chain payout that already happened. Callers can
 * fire-and-forget; any error is swallowed and logged. Failed HTTP deliveries are
 * still persisted in `webhook_deliveries` and retried by the backoff processor.
 */
export async function emitMilestonePayoutApproved(
  payload: MilestonePayoutApprovedPayload
): Promise<WebhookDeliveryRow[]> {
  try {
    const pool = getPool();
    return await dispatchEvent(pool, 'milestone.payout.approved', {
      ...payload,
    });
  } catch (err) {
    console.error('[webhook] failed to emit milestone.payout.approved', err);
    return [];
  }
}
