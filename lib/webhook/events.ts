/**
 * High-level event emitters that translate platform actions into webhook
 * dispatches. Keep call sites (API routes, workers) free of dispatch plumbing.
 */

import { getPool } from '@/lib/db/client';
import { dispatchEvent } from './dispatch';
import type {
  MilestonePayoutApprovedPayload,
  PlanterTreeRegisteredPayload,
  PlanterTreeVerifiedPayload,
  PlanterTreeHealthUpdatedPayload,
  PlanterMilestoneClaimedPayload,
  WebhookDeliveryRow,
} from './types';

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

export async function emitPlanterTreeRegistered(
  payload: PlanterTreeRegisteredPayload
): Promise<WebhookDeliveryRow[]> {
  try {
    const pool = getPool();
    return await dispatchEvent(pool, 'planter.tree.registered', { ...payload });
  } catch (err) {
    console.error('[webhook] failed to emit planter.tree.registered', err);
    return [];
  }
}

export async function emitPlanterTreeVerified(
  payload: PlanterTreeVerifiedPayload
): Promise<WebhookDeliveryRow[]> {
  try {
    const pool = getPool();
    return await dispatchEvent(pool, 'planter.tree.verified', { ...payload });
  } catch (err) {
    console.error('[webhook] failed to emit planter.tree.verified', err);
    return [];
  }
}

export async function emitPlanterTreeHealthUpdated(
  payload: PlanterTreeHealthUpdatedPayload
): Promise<WebhookDeliveryRow[]> {
  try {
    const pool = getPool();
    const legacyPayload = { ...payload };
    const canonicalPayload = {
      planterWallet: payload.planterWallet,
      sponsorWallet: payload.planterWallet,
      treeId: payload.treeId,
      previousStatus: payload.previousHealth,
      newStatus: payload.newHealth,
      transactionHash: payload.transactionHash,
      explorerUrl: payload.explorerUrl,
      changedAt: payload.updatedAt,
    };

    const results = await Promise.all([
      dispatchEvent(pool, 'planter.tree.health.updated', legacyPayload),
      dispatchEvent(pool, 'tree.status.changed', canonicalPayload),
    ]);

    return results.flat();
  } catch (err) {
    console.error('[webhook] failed to emit planter.tree.health.updated', err);
    return [];
  }
}

export async function emitTreeStatusChanged(
  payload: Record<string, unknown>
): Promise<WebhookDeliveryRow[]> {
  try {
    const pool = getPool();
    return await dispatchEvent(pool, 'tree.status.changed', { ...payload });
  } catch (err) {
    console.error('[webhook] failed to emit tree.status.changed', err);
    return [];
  }
}

export async function emitPlanterMilestoneClaimed(
  payload: PlanterMilestoneClaimedPayload
): Promise<WebhookDeliveryRow[]> {
  try {
    const pool = getPool();
    return await dispatchEvent(pool, 'planter.milestone.claimed', { ...payload });
  } catch (err) {
    console.error('[webhook] failed to emit planter.milestone.claimed', err);
    return [];
  }
}
