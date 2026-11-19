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
// Instead of sending an email for every event, events are persisted to the
// `notification_events` table and compiled into a single summary email that is
// sent at 9 AM in the sponsor's timezone.
// ---------------------------------------------------------------------------

import { getPool } from './db/client';

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

/** An event that has not yet been included in a delivered digest. */
export interface PendingDigestEvent extends DigestEvent {
  /** Database row id of the persisted event. */
  rowId: number;
}

interface NotificationEventRow {
  id: number;
  sponsor_id: string;
  event_id: string;
  title: string;
  description: string | null;
  occurred_at: Date | string;
  url: string | null;
}

function rowToDigestEvent(row: NotificationEventRow): DigestEvent {
  return {
    id: row.event_id,
    sponsorId: row.sponsor_id,
    title: row.title,
    description: row.description ?? undefined,
    occurredAt: row.occurred_at instanceof Date ? row.occurred_at : new Date(row.occurred_at),
    url: row.url ?? undefined,
  };
}

/**
 * Persist an event for a sponsor's daily digest instead of sending an email
 * immediately. Events are aggregated and delivered by {@link sendDailyDigest}.
 */
export async function enqueueDigestEvent(event: DigestEvent): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO notification_events
       (sponsor_id, event_id, title, description, occurred_at, url)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (sponsor_id, event_id) DO NOTHING`,
    [
      event.sponsorId,
      event.id,
      event.title,
      event.description ?? null,
      event.occurredAt,
      event.url ?? null,
    ]
  );
}

/**
 * Returns the pending (not yet delivered) events for a sponsor, ordered by
 * occurrence time. Does not mark them as delivered.
 */
export async function getPendingDigestEvents(sponsorId: string): Promise<DigestEvent[]> {
  const pool = getPool();
  const result = await pool.query<NotificationEventRow>(
    `SELECT id, sponsor_id, event_id, title, description, occurred_at, url
       FROM notification_events
      WHERE sponsor_id = $1 AND delivered_at IS NULL
      ORDER BY occurred_at ASC`,
    [sponsorId]
  );
  return result.rows.map(rowToDigestEvent);
}

/**
 * Mark the given events as delivered so they are not included in future
 * digests. Events are identified by their `(sponsorId, eventId)` pair.
 */
export async function markDigestEventsDelivered(
  sponsorId: string,
  eventIds: string[],
  deliveredAt: Date = new Date()
): Promise<void> {
  if (eventIds.length === 0) {
    return;
  }
  const pool = getPool();
  await pool.query(
    `UPDATE notification_events
        SET delivered_at = $1
      WHERE sponsor_id = $2 AND event_id = ANY($3::text[]) AND delivered_at IS NULL`,
    [deliveredAt, sponsorId, eventIds]
  );
}

/**
 * Group a flat list of events by sponsor id. Useful when events are loaded
 * from a persistent store rather than a single sponsor's queue.
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
  const events = await getPendingDigestEvents(settings.sponsorId);
  const email = buildDigestEmail(settings, events);

  if (!email) {
    return null;
  }

  await sendEmail(email);
  await markDigestEventsDelivered(
    settings.sponsorId,
    email.events.map((event) => event.id)
  );
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

// ---------------------------------------------------------------------------
// Push notifications for tree milestones and sponsor achievements (#1121)
//
// Milestone and achievement events are dispatched to every registered device
// for a sponsor. Devices may be web push subscriptions or Expo push tokens.
// ---------------------------------------------------------------------------

export type TreeMilestoneType = 'tree_planted' | 'survival_1_year' | 'milestone_5_year';

export type SponsorAchievementType =
  | 'first_tree'
  | 'ten_trees'
  | 'hundred_trees'
  | 'co2_offset'
  | 'species_diversity';

export interface TreeMilestoneEvent {
  kind: 'tree_milestone';
  sponsorId: string;
  milestone: TreeMilestoneType;
  /** Optional tree identifier the milestone relates to. */
  treeId?: string;
  /** Optional species name, used to personalise the message. */
  species?: string;
  /** Optional planting zone name. */
  zone?: string;
}

export interface SponsorAchievementEvent {
  kind: 'sponsor_achievement';
  sponsorId: string;
  achievement: SponsorAchievementType;
  /** Optional numeric value associated with the achievement (e.g. tree count). */
  value?: number;
}

export type PushNotificationEvent = TreeMilestoneEvent | SponsorAchievementEvent;

export interface WebPushSubscriptionRecord {
  type: 'web';
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface ExpoPushTokenRecord {
  type: 'expo';
  token: string;
}

export type DeviceToken = WebPushSubscriptionRecord | ExpoPushTokenRecord;

export interface PushPayload {
  title: string;
  body: string;
  /** Arbitrary data delivered alongside the notification. */
  data?: Record<string, unknown>;
  /** Optional deep link opened when the notification is tapped. */
  url?: string;
}

/** Builds the title/body for a push notification from a typed event. */
export function buildPushPayload(event: PushNotificationEvent): PushPayload {
  if (event.kind === 'tree_milestone') {
    const species = event.species ? ` ${event.species}` : '';
    const zone = event.zone ? ` in ${event.zone}` : '';
    switch (event.milestone) {
      case 'tree_planted':
        return {
          title: 'Your tree has been planted! 🌱',
          body: `A${species} tree you sponsored was just planted${zone}.`,
          data: { kind: event.kind, milestone: event.milestone, treeId: event.treeId },
          url: event.treeId ? `/trees/${event.treeId}` : '/dashboard',
        };
      case 'survival_1_year':
        return {
          title: 'Your tree survived its first year! 🎉',
          body: `A${species} tree you sponsored has reached its 1-year survival milestone${zone}.`,
          data: { kind: event.kind, milestone: event.milestone, treeId: event.treeId },
          url: event.treeId ? `/trees/${event.treeId}` : '/dashboard',
        };
      case 'milestone_5_year':
        return {
          title: '5-year milestone reached! 🌳',
          body: `A${species} tree you sponsored has thrived for 5 years${zone}. Thank you for your lasting impact.`,
          data: { kind: event.kind, milestone: event.milestone, treeId: event.treeId },
          url: event.treeId ? `/trees/${event.treeId}` : '/dashboard',
        };
    }
  }

  const value = event.value;
  switch (event.achievement) {
    case 'first_tree':
      return {
        title: 'Achievement unlocked: First Tree! 🏆',
        body: 'You planted your very first tree. Welcome to the forest!',
        data: { kind: event.kind, achievement: event.achievement },
        url: '/achievements',
      };
    case 'ten_trees':
      return {
        title: 'Achievement unlocked: Grove Grower! 🏆',
        body: `You have funded ${value ?? 10} trees. Your grove is growing!`,
        data: { kind: event.kind, achievement: event.achievement },
        url: '/achievements',
      };
    case 'hundred_trees':
      return {
        title: 'Achievement unlocked: Forest Founder! 🏆',
        body: `You have funded ${value ?? 100} trees. That is a whole forest!`,
        data: { kind: event.kind, achievement: event.achievement },
        url: '/achievements',
      };
    case 'co2_offset':
      return {
        title: 'Achievement unlocked: Carbon Crusher! 🏆',
        body: `Your trees have offset ${value ?? 0} kg of CO2.`,
        data: { kind: event.kind, achievement: event.achievement },
        url: '/achievements',
      };
    case 'species_diversity':
      return {
        title: 'Achievement unlocked: Biodiversity Champion! 🏆',
        body: `You have supported ${value ?? 0} different tree species.`,
        data: { kind: event.kind, achievement: event.achievement },
        url: '/achievements',
      };
  }
}

export interface PushDeliveryResult {
  delivered: number;
  failed: number;
}

/**
 * Delivers a push notification to all of a sponsor's registered devices.
 * The `sendWebPush` and `sendExpoPush` callbacks perform the actual network
 * delivery so this module stays free of provider-specific dependencies.
 */
export async function dispatchPushNotification(
  event: PushNotificationEvent,
  devices: DeviceToken[],
  sendWebPush: (subscription: WebPushSubscriptionRecord, payload: PushPayload) => Promise<void>,
  sendExpoPush: (token: ExpoPushTokenRecord, payload: PushPayload) => Promise<void>
): Promise<PushDeliveryResult> {
  const payload = buildPushPayload(event);
  const result: PushDeliveryResult = { delivered: 0, failed: 0 };

  for (const device of devices) {
    try {
      if (device.type === 'web') {
        await sendWebPush(device, payload);
      } else {
        await sendExpoPush(device, payload);
      }
      result.delivered += 1;
    } catch (error) {
      console.error('Failed to deliver push notification:', error);
      result.failed += 1;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Annual impact summary email (#1712)
//
// Sent on December 20 each year to every sponsor, summarising their impact
// over the year with a shareable impact image.
// ---------------------------------------------------------------------------

export interface AnnualImpactStats {
  treesFunded: number;
  co2AbsorbedKg: number;
  speciesCount: number;
  milestonesReached: string[];
}

export interface AnnualImpactEmailSettings {
  sponsorId: string;
  sponsorName: string;
  email: string;
  year: number;
  stats: AnnualImpactStats;
  /** URL of the generated shareable impact image. */
  impactImageUrl: string;
}

export interface AnnualImpactEmail {
  sponsorId: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Whether the annual impact summary should be sent (December 20). */
export function isAnnualImpactSendDate(now: Date = new Date()): boolean {
  return now.getMonth() === 11 && now.getDate() === 20;
}

/** Compile the personalised year-in-review email for a sponsor. */
export function buildAnnualImpactEmail(settings: AnnualImpactEmailSettings): AnnualImpactEmail {
  const { sponsorName, year, stats, impactImageUrl } = settings;
  const subject = `Your ${year} impact with us, ${sponsorName}`;

  const milestoneLines =
    stats.milestonesReached.length > 0
      ? stats.milestonesReached.map((m) => `- ${m}`)
      : ['- No milestones yet - your next tree could be the one!'];

  const text = [
    `Hi ${sponsorName},`,
    '',
    `Here is your ${year} impact summary:`,
    `- Trees funded: ${stats.treesFunded}`,
    `- CO2 absorbed: ${stats.co2AbsorbedKg} kg`,
    `- Species supported: ${stats.speciesCount}`,
    '',
    'Milestones reached:',
    ...milestoneLines,
    '',
    `View and share your impact image: ${impactImageUrl}`,
    '',
    'Thank you for making a difference!',
  ].join('\n');

  const htmlMilestones =
    stats.milestonesReached.length > 0
      ? `<ul>${stats.milestonesReached.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>`
      : '<p style="color:#555;">No milestones yet - your next tree could be the one!</p>';

  const html = [
    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">',
    `<h2>Hi ${escapeHtml(sponsorName)},</h2>`,
    `<p>Here is your ${year} impact summary:</p>`,
    '<ul>',
    `<li>Trees funded: <strong>${stats.treesFunded}</strong></li>`,
    `<li>CO2 absorbed: <strong>${stats.co2AbsorbedKg} kg</strong></li>`,
    `<li>Species supported: <strong>${stats.speciesCount}</strong></li>`,
    '</ul>',
    '<h3>Milestones reached</h3>',
    htmlMilestones,
    `<p><img src="${escapeHtml(impactImageUrl)}" alt="Your ${year} impact" style="max-width:100%;border-radius:8px;" /></p>`,
    `<p><a href="${escapeHtml(impactImageUrl)}" style="color:#1a73e8;">View and share your impact image</a></p>`,
    '<p>Thank you for making a difference!</p>',
    '</div>',
  ].join('');

  return { sponsorId: settings.sponsorId, to: settings.email, subject, html, text };
}

/**
 * Compile and send the annual impact summary email for a single sponsor.
 * The `sendEmail` callback performs the actual delivery.
 */
export async function sendAnnualImpactEmail(
  settings: AnnualImpactEmailSettings,
  sendEmail: (email: AnnualImpactEmail) => Promise<void>
): Promise<AnnualImpactEmail> {
  const email = buildAnnualImpactEmail(settings);
  await sendEmail(email);
  return email;
}

// ---------------------------------------------------------------------------
// Waitlist assignment email (#1718)
//
// Sent when a sponsor on a planting zone waitlist is automatically assigned a
// tree from the next planting batch.
// ---------------------------------------------------------------------------

export interface WaitlistAssignmentEmailSettings {
  sponsorId: string;
  sponsorName: string;
  email: string;
  zoneName: string;
  treeId: string;
  species?: string;
}

export interface WaitlistAssignmentEmail {
  sponsorId: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** Compile the waitlist assignment notification email. */
export function buildWaitlistAssignmentEmail(
  settings: WaitlistAssignmentEmailSettings
): WaitlistAssignmentEmail {
  const { sponsorName, zoneName, treeId, species } = settings;
  const subject = `A tree has been assigned to you in ${zoneName}!`;
  const speciesText = species ? ` (${species})` : '';

  const text = [
    `Hi ${sponsorName},`,
    '',
    `Great news! A tree${speciesText} has been assigned to you from the waitlist in ${zoneName}.`,
    `Tree ID: ${treeId}`,
    '',
    'Thank you for your patience and support!',
  ].join('\n');

  const html = [
    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">',
    `<h2>Hi ${escapeHtml(sponsorName)},</h2>`,
    `<p>Great news! A tree${escapeHtml(speciesText)} has been assigned to you from the waitlist in <strong>${escapeHtml(zoneName)}</strong>.</p>`,
    `<p>Tree ID: <strong>${escapeHtml(treeId)}</strong></p>`,
    '<p>Thank you for your patience and support!</p>',
    '</div>',
  ].join('');

  return { sponsorId: settings.sponsorId, to: settings.email, subject, html, text };
}

/**
 * Compile and send the waitlist assignment email for a single sponsor.
 * The `sendEmail` callback performs the actual delivery.
 */
export async function sendWaitlistAssignmentEmail(
  settings: WaitlistAssignmentEmailSettings,
  sendEmail: (email: WaitlistAssignmentEmail) => Promise<void>
): Promise<WaitlistAssignmentEmail> {
  const email = buildWaitlistAssignmentEmail(settings);
  await sendEmail(email);
  return email;
}
