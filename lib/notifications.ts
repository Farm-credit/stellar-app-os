export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  actions?: Array<{ action: string; title: string; icon?: string }>;
  data?: Record<string, string | number | boolean | null>;
}

export interface TreeMilestoneNotificationInput {
  treeId: string;
  species: string;
  milestone: string;
  co2OffsetKg: number;
  location: string;
}

export interface SponsorAchievementNotificationInput {
  sponsorName: string;
  badge: string;
  totalTrees: number;
  totalCo2Kg: number;
}

export function buildTreeMilestoneNotification({
  treeId,
  species,
  milestone,
  co2OffsetKg,
  location,
}: TreeMilestoneNotificationInput): PushNotificationPayload {
  const info = `${species} tree ${treeId} in ${location} is now confirmed.`;

  return {
    title: `${milestone} milestone reached`,
    body: `${info} Estimated impact: ${co2OffsetKg} kg CO₂ offset.`,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    tag: `tree-${treeId}`,
    actions: [
      { action: 'view', title: 'View', icon: '/icons/icon-192x192.png' },
      { action: 'close', title: 'Close' },
    ],
    data: {
      type: 'tree_milestone',
      treeId,
      species,
      milestone,
      co2OffsetKg,
      location,
    },
  };
}

export function buildSponsorAchievementNotification({
  sponsorName,
  badge,
  totalTrees,
  totalCo2Kg,
}: SponsorAchievementNotificationInput): PushNotificationPayload {
  return {
    title: `${badge} unlocked`,
    body: `${sponsorName} has planted ${totalTrees} trees and offset ${totalCo2Kg} kg of CO₂.`,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    tag: `badge-${badge.toLowerCase().replace(/\s+/g, '-')}`,
    actions: [
      { action: 'view', title: 'View', icon: '/icons/icon-192x192.png' },
      { action: 'close', title: 'Close' },
    ],
    data: {
      type: 'sponsor_achievement',
      sponsorName,
      badge,
      totalTrees,
      totalCo2Kg,
    },
  };
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    console.warn('This browser does not support notifications');
    return 'denied';
  }

  if (Notification.permission === 'granted') {
    return 'granted';
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission;
  }

  return Notification.permission;
}

export async function subscribeToPushNotifications(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push notifications are not supported');
    return null;
  }

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  if (!vapidKey) {
    console.warn('VAPID public key not configured');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToArrayBuffer(vapidKey),
    });

    return subscription;
  } catch (error) {
    console.error('Failed to subscribe to push notifications:', error);
    return null;
  }
}

export async function unsubscribeFromPushNotifications(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      return await subscription.unsubscribe();
    }

    return false;
  } catch (error) {
    console.error('Failed to unsubscribe from push notifications:', error);
    return false;
  }
}

function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

export function showNotification(title: string, options?: NotificationOptions): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  void navigator.serviceWorker.ready.then((registration) => {
    registration.showNotification(title, {
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      ...options,
    });
  });
}
