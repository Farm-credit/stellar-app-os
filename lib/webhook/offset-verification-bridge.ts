/**
 * Offset-verification webhook bridge — Issue #1316
 *
 * The event contract in `./offset-verification` and the dispatchers in
 * `./events` were shipped without call sites, so no external system was ever
 * notified when credits were verified, a project approved, credits retired, a
 * series repriced or a project status changed.
 *
 * This module is the missing seam between domain actions and the webhook
 * pipeline. Each `notify*` helper:
 *
 *   1. builds the payload through the shared validated builder, so a malformed
 *      event fails here instead of being HMAC-signed and POSTed to subscribers;
 *   2. hands it to the matching emitter, which fans it out to every matching
 *      subscription and persists failed deliveries for the backoff retry worker;
 *   3. never throws. Notifications are outbound side-effects — a webhook problem
 *      must not fail (or roll back) the registry/on-chain action that triggered
 *      it. Callers may therefore fire-and-forget with `void notify…(...)`.
 *
 * Invalid payloads are logged with the offending field names (from
 * `OffsetVerificationEventError.fields`) so integration bugs are still visible.
 */

import {
  OffsetVerificationEventError,
  buildCreditRetiredEvent,
  buildCreditVerifiedEvent,
  buildPriceChangedEvent,
  buildProjectApprovedEvent,
  buildProjectStatusChangedEvent,
  type CreditRetiredInput,
  type CreditVerifiedInput,
  type PriceChangedInput,
  type ProjectApprovedInput,
  type ProjectStatusChangedInput,
} from './offset-verification';
import {
  emitCreditRetired,
  emitCreditVerified,
  emitPriceChanged,
  emitProjectApproved,
  emitProjectStatusChanged,
} from './events';
import type { WebhookDeliveryRow } from './types';

/**
 * Build then emit, downgrading every failure to an empty delivery list. The
 * builder throws synchronously on bad input and the emitter already swallows
 * transport errors, but a future emitter that throws must not break callers.
 */
async function safelyEmit<TPayload>(
  eventType: string,
  build: () => { data: TPayload },
  emit: (payload: TPayload) => Promise<WebhookDeliveryRow[]>
): Promise<WebhookDeliveryRow[]> {
  try {
    const { data } = build();
    return await emit(data);
  } catch (error) {
    if (error instanceof OffsetVerificationEventError) {
      console.error(`[webhook] rejected ${eventType} payload: ${error.message}`, {
        fields: error.fields,
      });
    } else {
      console.error(`[webhook] failed to emit ${eventType}`, error);
    }
    return [];
  }
}

/** `credit.verified` — a verifier/registry confirmed issued credits. */
export function notifyCreditVerified(input: CreditVerifiedInput): Promise<WebhookDeliveryRow[]> {
  return safelyEmit('credit.verified', () => buildCreditVerifiedEvent(input), emitCreditVerified);
}

/** `project.approved` — a carbon project passed review. */
export function notifyProjectApproved(input: ProjectApprovedInput): Promise<WebhookDeliveryRow[]> {
  return safelyEmit(
    'project.approved',
    () => buildProjectApprovedEvent(input),
    emitProjectApproved
  );
}

/** `credit.retired` — a buyer retired credits against an emission. */
export function notifyCreditRetired(input: CreditRetiredInput): Promise<WebhookDeliveryRow[]> {
  return safelyEmit('credit.retired', () => buildCreditRetiredEvent(input), emitCreditRetired);
}

/** `price.changed` — a listed credit series was repriced. */
export function notifyPriceChanged(input: PriceChangedInput): Promise<WebhookDeliveryRow[]> {
  return safelyEmit('price.changed', () => buildPriceChangedEvent(input), emitPriceChanged);
}

/** `project.status.changed` — a project moved to a new lifecycle status. */
export function notifyProjectStatusChanged(
  input: ProjectStatusChangedInput
): Promise<WebhookDeliveryRow[]> {
  return safelyEmit(
    'project.status.changed',
    () => buildProjectStatusChangedEvent(input),
    emitProjectStatusChanged
  );
}
