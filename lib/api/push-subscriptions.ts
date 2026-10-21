/**
 * Sponsor push subscription storage — Issue #1698.
 *
 * In-process Map keyed by sponsor id (wallet public key), then endpoint. Swap
 * `store` for a database without changing the routes.
 */
import type { StoredPushSubscription } from '@/lib/push/sender';

export class PushSubscriptionError extends Error {
  status = 400;
}

const store = new Map<string, Map<string, StoredPushSubscription>>();

export function parseSubscription(value: unknown): StoredPushSubscription {
  const v = value as Partial<StoredPushSubscription> | null;
  const endpoint = typeof v?.endpoint === 'string' ? v.endpoint.trim() : '';
  const p256dh = v?.keys?.p256dh;
  const auth = v?.keys?.auth;
  if (!endpoint.startsWith('https://') || typeof p256dh !== 'string' || typeof auth !== 'string') {
    throw new PushSubscriptionError('A valid push subscription is required');
  }
  return { endpoint, keys: { p256dh, auth } };
}

function requireSponsor(sponsorId: unknown): string {
  const id = typeof sponsorId === 'string' ? sponsorId.trim() : '';
  if (!id) throw new PushSubscriptionError('Sponsor id is required');
  return id;
}

export function saveSubscription(sponsorId: unknown, subscription: unknown): void {
  const id = requireSponsor(sponsorId);
  const parsed = parseSubscription(subscription);
  const byEndpoint = store.get(id) ?? new Map<string, StoredPushSubscription>();
  byEndpoint.set(parsed.endpoint, parsed);
  store.set(id, byEndpoint);
}

export function removeSubscription(sponsorId: unknown, endpoint: unknown): void {
  const id = requireSponsor(sponsorId);
  if (typeof endpoint === 'string') store.get(id)?.delete(endpoint);
}

export function listSubscriptions(sponsorId: string): StoredPushSubscription[] {
  return [...(store.get(sponsorId)?.values() ?? [])];
}

export function resetPushSubscriptionsForTest(): void {
  store.clear();
}
