/**
 * High-level event emitters that translate platform actions into webhook
 * dispatches. Keep call sites (API routes, workers) free of dispatch plumbing.
 */

import { getPool } from '@/lib/db/client';
import { dispatchEvent } from './dispatch';
import type { OffsetVerificationEventType } from './offset-verification';
import type {
  MilestonePayoutApprovedPayload,
  PlanterTreeRegisteredPayload,
  PlanterTreeVerifiedPayload,
  PlanterTreeHealthUpdatedPayload,
  PlanterMilestoneClaimedPayload,
  CreditVerifiedPayload,
  ProjectApprovedPayload,
  CreditRetiredPayload,
  PriceChangedPayload,
  ProjectStatusChangedPayload,
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

/** Emit one of the partner-facing tree lifecycle events. */
export async function emitTreeLifecycleEvent(
  eventType: 'tree.planted' | 'tree.verified' | 'tree.grown' | 'tree.died',
  payload: Record<string, unknown>
): Promise<WebhookDeliveryRow[]> {
  try {
    return await dispatchEvent(getPool(), eventType, {
      ...payload,
      occurredAt: payload.occurredAt ?? new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[webhook] failed to emit ${eventType}`, err);
    return [];
  }
}

/** Translate the persisted tree status vocabulary to partner event names. */
export function emitTreeLifecycleForStatus(
  status: string,
  payload: Record<string, unknown>
): Promise<WebhookDeliveryRow[]> {
  const eventByStatus: Record<
    string,
    'tree.planted' | 'tree.verified' | 'tree.grown' | 'tree.died'
  > = {
    planted: 'tree.planted',
    verified: 'tree.verified',
    completed: 'tree.grown',
    failed: 'tree.died',
  };
  const eventType = eventByStatus[status];
  return eventType ? emitTreeLifecycleEvent(eventType, payload) : Promise.resolve([]);
}

// ── Offset-verification events (issue #1378) ──────────────────────────────────
//
// One emitter per offset lifecycle event, all best-effort: a webhook failure
// must never fail the registry/on-chain action that triggered it. Build the
// payload with the matching builder in `./offset-verification` so it is
// validated before it is signed and fanned out.

/**
 * Shared best-effort dispatch for the offset-verification events. Failed HTTP
 * deliveries are still persisted in `webhook_deliveries` and retried by the
 * backoff processor, so swallowing the error here does not drop the event.
 */
async function emitOffsetVerificationEvent(
  eventType: OffsetVerificationEventType,
  payload: Record<string, unknown>
): Promise<WebhookDeliveryRow[]> {
  try {
    return await dispatchEvent(getPool(), eventType, payload);
  } catch (err) {
    console.error(`[webhook] failed to emit ${eventType}`, err);
    return [];
  }
}

/** Emit `credit.verified` once a verifier/registry confirms an issuance. */
export async function emitCreditVerified(
  payload: CreditVerifiedPayload
): Promise<WebhookDeliveryRow[]> {
  return emitOffsetVerificationEvent('credit.verified', { ...payload });
}

/** Emit `project.approved` when a carbon project passes review. */
export async function emitProjectApproved(
  payload: ProjectApprovedPayload
): Promise<WebhookDeliveryRow[]> {
  return emitOffsetVerificationEvent('project.approved', { ...payload });
}

/** Emit `credit.retired` when a buyer retires credits. */
export async function emitCreditRetired(
  payload: CreditRetiredPayload
): Promise<WebhookDeliveryRow[]> {
  return emitOffsetVerificationEvent('credit.retired', { ...payload });
}

/** Emit `price.changed` when a listed series is repriced. */
export async function emitPriceChanged(
  payload: PriceChangedPayload
): Promise<WebhookDeliveryRow[]> {
  return emitOffsetVerificationEvent('price.changed', { ...payload });
}

/** Emit `project.status.changed` when a project moves lifecycle status. */
export async function emitProjectStatusChanged(
  payload: ProjectStatusChangedPayload
): Promise<WebhookDeliveryRow[]> {
  return emitOffsetVerificationEvent('project.status.changed', { ...payload });
}
