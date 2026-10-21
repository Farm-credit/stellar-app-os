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

  // Check if VAPID key is available
  const vapidKey =
    typeof window !== 'undefined'
      ? (window as typeof window & { ENV?: { NEXT_PUBLIC_VAPID_PUBLIC_KEY?: string } }).ENV
          ?.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      : undefined;
  const key = vapidKey ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  if (!key) {
    console.warn('VAPID public key not configured');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
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

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  // Return as BufferSource compatible type
  return new Uint8Array(outputArray.buffer);
}

export function showNotification(title: string, options?: NotificationOptions): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  navigator.serviceWorker.ready.then((registration) => {
    registration.showNotification(title, {
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      ...options,
    });
  });
}

// ---------------------------------------------------------------------------
// Daily email digest (#992)
//
// Instead of sending an email for every event, events are enqueued per sponsor
// and compiled into a single summary email that is sent at 9 AM in the
// sponsor's timezone.
// ---------------------------------------------------------------------------

export interface DigestEvent {
  /** Unique identifier for the event. */
  id: string;
  /** Sponsor the event belongs to. */
  sponsorId: string;
  /** Short event title, e.g. "New pledge received". */
  title: string;
  /** Optional longer description. */
  description?: string;
  /** When the event occurred. */
  occurredAt: Date;
  /** Optional link to view the event in the app. */
  url?: string;
}

export interface DigestEmail {
  sponsorId: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  events: DigestEvent[];
}

export interface SponsorDigestSettings {
  sponsorId: string;
  email: string;
  /** IANA timezone, e.g. "America/New_York". */
  timezone: string;
}

/** In-memory queue of pending digest events, keyed by sponsor id. */
const digestQueue = new Map<string, DigestEvent[]>();

/**
 * Record an event for a sponsor's daily digest instead of sending an email
 * immediately. Events are aggregated and delivered by {@link sendDailyDigest}.
 */
export function enqueueDigestEvent(event: DigestEvent): void {
  const existing = digestQueue.get(event.sponsorId) ?? [];
  existing.push(event);
  digestQueue.set(event.sponsorId, existing);
}

/** Returns the pending events for a sponsor (does not clear the queue). */
export function getPendingDigestEvents(sponsorId: string): DigestEvent[] {
  return [...(digestQueue.get(sponsorId) ?? [])];
}

/** Clears the pending events for a sponsor. */
export function clearDigestEvents(sponsorId: string): void {
  digestQueue.delete(sponsorId);
}

/**
 * Group a flat list of events by sponsor id. Useful when events are loaded
 * from a persistent store rather than the in-memory queue.
 */
export function groupEventsBySponsor(events: DigestEvent[]): Map<string, DigestEvent[]> {
  const grouped = new Map<string, DigestEvent[]>();
  for (const event of events) {
    const existing = grouped.get(event.sponsorId) ?? [];
    existing.push(event);
    grouped.set(event.sponsorId, existing);
  }
  return grouped;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatEventTime(event: DigestEvent, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(event.occurredAt);
  } catch {
    return event.occurredAt.toISOString();
  }
}

/**
 * Compile a sponsor's events into a single summary email. Returns `null` when
 * there is nothing to send.
 */
export function buildDigestEmail(
  settings: SponsorDigestSettings,
  events: DigestEvent[]
): DigestEmail | null {
  if (events.length === 0) {
    return null;
  }

  const sorted = [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const count = sorted.length;
  const subject =
    count === 1 ? 'Your daily summary: 1 update' : `Your daily summary: ${count} updates`;

  const textLines = sorted.map((event) => {
    const time = formatEventTime(event, settings.timezone);
    const description = event.description ? ` - ${event.description}` : '';
    const url = event.url ? ` (${event.url})` : '';
    return `- [${time}] ${event.title}${description}${url}`;
  });

  const text = [
    `Here is your daily summary of ${count} update${count === 1 ? '' : 's'}:`,
    '',
    ...textLines,
  ].join('\n');

  const htmlItems = sorted
    .map((event) => {
      const time = escapeHtml(formatEventTime(event, settings.timezone));
      const title = escapeHtml(event.title);
      const description = event.description
        ? `<div style="color:#555;margin-top:2px;">${escapeHtml(event.description)}</div>`
        : '';
      const titleHtml = event.url
        ? `<a href="${escapeHtml(event.url)}" style="color:#1a73e8;text-decoration:none;">${title}</a>`
        : title;
      return `<li style="margin-bottom:12px;"><div style="font-weight:600;">${titleHtml}</div>${description}<div style="color:#888;font-size:12px;margin-top:2px;">${time}</div></li>`;
    })
    .join('');

  const html = [
    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">',
    `<h2 style="margin-bottom:4px;">Your daily summary</h2>`,
    `<p style="color:#555;margin-top:0;">${count} update${count === 1 ? '' : 's'} from the last day.</p>`,
    `<ul style="list-style:none;padding:0;margin:0;">${htmlItems}</ul>`,
    '</div>',
  ].join('');

  return {
    sponsorId: settings.sponsorId,
    to: settings.email,
    subject,
    html,
    text,
    events: sorted,
  };
}

/**
 * Compile and send the daily digest for a single sponsor. The provided
 * `sendEmail` callback performs the actual delivery (e.g. via an email
 * provider). Pending events are cleared only after a successful send.
 */
export async function sendDailyDigest(
  settings: SponsorDigestSettings,
  sendEmail: (email: DigestEmail) => Promise<void>
): Promise<DigestEmail | null> {
  const events = getPendingDigestEvents(settings.sponsorId);
  const email = buildDigestEmail(settings, events);

  if (!email) {
    return null;
  }

  await sendEmail(email);
  clearDigestEvents(settings.sponsorId);
  return email;
}

/**
 * Send daily digests for all sponsors that have pending events. Intended to be
 * invoked by a scheduler at 9 AM in each sponsor's timezone.
 */
export async function sendAllDailyDigests(
  sponsors: SponsorDigestSettings[],
  sendEmail: (email: DigestEmail) => Promise<void>
): Promise<DigestEmail[]> {
  const sent: DigestEmail[] = [];
  for (const settings of sponsors) {
    const email = await sendDailyDigest(settings, sendEmail);
    if (email) {
      sent.push(email);
    }
  }
  return sent;
}

/**
 * Returns the current hour (0-23) in the given IANA timezone. Useful for
 * schedulers that need to fire at 9 AM local time.
 */
export function getHourInTimezone(timezone: string, now: Date = new Date()): number {
  try {
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).format(now);
    return parseInt(formatted, 10) % 24;
  } catch {
    return now.getHours();
  }
}

/** Whether it is currently 9 AM in the given timezone. */
export function isDigestSendTime(timezone: string, now: Date = new Date()): boolean {
  return getHourInTimezone(timezone, now) === 9;
}
