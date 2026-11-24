/**
 * Server-side Web Push delivery — Issue #1698.
 *
 * Uses the `web-push` library with VAPID keys. When the keys are not configured
 * the sender reports `skipped` so health alerts are still recorded but nothing
 * is sent. Tests inject a fake sender with `setPushSenderForTest`.
 */
import type { PushPayload } from '@/lib/types/tree-health';

export interface StoredPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export type PushSendOutcome = 'sent' | 'gone' | 'failed';

export interface PushSender {
  /** False when push is not configured; callers skip delivery. */
  readonly configured: boolean;
  send(subscription: StoredPushSubscription, payload: PushPayload): Promise<PushSendOutcome>;
}

export function getVapidConfig(): {
  publicKey: string;
  privateKey: string;
  subject: string;
} | null {
  const publicKey = (
    process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  )?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:support@farmcredit.example';
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

function createWebPushSender(): PushSender {
  const vapid = getVapidConfig();
  if (!vapid) {
    return { configured: false, send: () => Promise.resolve('failed') };
  }
  return {
    configured: true,
    async send(subscription, payload) {
      try {
        const webpush = (await import('web-push')).default;
        webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
        await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 86400 });
        return 'sent';
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        // 404/410: the browser dropped this subscription, so stop sending to it.
        return status === 404 || status === 410 ? 'gone' : 'failed';
      }
    },
  };
}

let override: PushSender | null = null;

export function getPushSender(): PushSender {
  return override ?? createWebPushSender();
}

export function setPushSenderForTest(sender: PushSender | null): void {
  override = sender;
}
