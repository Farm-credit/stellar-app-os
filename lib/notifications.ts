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

async function getDbPool() {
  const { getPool } = await import('./db/client');
  return getPool();
}

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
  const pool = await getDbPool();
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
  const pool = await getDbPool();
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
  const pool = await getDbPool();
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
  'first_tree' | 'ten_trees' | 'hundred_trees' | 'co2_offset' | 'species_diversity';

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

// ---------------------------------------------------------------------------
// Monthly forest health newsletter (#1703)
//
// A curated monthly newsletter sent to sponsors who have opted in. It contains
// platform news, featured reforestation stories, species spotlights and
// conservation tips, plus a personalised section with the sponsor's own tree
// updates. Sponsors can opt in/out via their notification preferences.
// ---------------------------------------------------------------------------

export interface NewsletterTreeUpdate {
  treeId: string;
  species?: string;
  zone?: string;
  /** Short human-readable status, e.g. "Planted", "Survived 1 year". */
  status: string;
  /** When the update occurred. */
  updatedAt: Date;
}

export interface NewsletterContent {
  /** Edition identifier, e.g. "2024-06". */
  edition: string;
  /** Human-readable edition title, e.g. "June 2024 Forest Health". */
  title: string;
  /** Platform news items. */
  news: string[];
  /** Featured reforestation stories. */
  featuredStories: string[];
  /** Species spotlights. */
  speciesSpotlights: string[];
  /** Conservation tips. */
  conservationTips: string[];
}

// Weekly sponsor impact digest (#1110)
//
// Automated weekly emails to sponsors showing tree growth updates (with tree
// photos), impact metrics, and community highlights.
// ---------------------------------------------------------------------------

export interface WeeklyDigestTreeUpdate {
  treeId: string;
  species?: string;
  /** Optional growth note, e.g. "Grew 12 cm this week". */
  growthNote?: string;
  /** Optional URL of a photo of the tree. */
  photoUrl?: string;
  /** Optional planting zone name. */
  zone?: string;
}

export interface WeeklyDigestMetrics {
  treesFunded: number;
  co2AbsorbedKg: number;
  speciesCount: number;
  /** Optional number of trees that survived the period. */
  treesSurvived?: number;
}

export interface NewsletterSponsorSettings {
  sponsorId: string;
  sponsorName: string;
  email: string;
}

export interface WeeklySponsorDigestSettings {
  sponsorId: string;
  sponsorName: string;
  email: string;
}

export interface MonthlyNewsletterEmail {
  sponsorId: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface WeeklySponsorDigestData {
  treeUpdates: WeeklyDigestTreeUpdate[];
  metrics: WeeklyDigestMetrics;
  highlights: string[];
}

export interface WeeklySponsorDigestEmail {
  sponsorId: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  /** The sponsor's personalised tree updates included in this edition. */
  treeUpdates: NewsletterTreeUpdate[];
}

/**
 * In-memory store of newsletter opt-in preferences, keyed by sponsor id.
 * Defaults to opted-in when no explicit preference has been recorded.
 */
const newsletterPreferences = new Map<string, boolean>();

/**
 * Returns whether a sponsor has opted in to the monthly newsletter. Sponsors
 * default to opted in until they explicitly opt out.
 */
export function getNewsletterPreference(sponsorId: string): boolean {
  return newsletterPreferences.get(sponsorId) ?? true;
}

/**
 * Persist a sponsor's newsletter opt-in preference. Used by the notification
 * preferences toggle and the admin newsletter CMS.
 */
export function setNewsletterPreference(sponsorId: string, optedIn: boolean): void {
  newsletterPreferences.set(sponsorId, optedIn);
}

/**
 * Fetches a sponsor's own tree updates for the personalised newsletter
 * section. The `fetchTreeUpdates` callback loads the updates from the data
 * source so this module stays free of data-layer dependencies.
 */
export async function getSponsorTreeUpdates(
  sponsorId: string,
  fetchTreeUpdates: (sponsorId: string) => Promise<NewsletterTreeUpdate[]>
): Promise<NewsletterTreeUpdate[]> {
  try {
    const updates = await fetchTreeUpdates(sponsorId);
    return [...updates].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  } catch (error) {
    console.error('Failed to load sponsor tree updates for newsletter:', error);
    return [];
  }
}

function buildTreeUpdatesSection(updates: NewsletterTreeUpdate[]): {
  html: string;
  text: string[];
} {
  if (updates.length === 0) {
    return {
      html: '<p style="color:#555;">No tree updates yet this month - your next tree could be the one!</p>',
      text: ['No tree updates yet this month - your next tree could be the one!'],
    };
  }

  const htmlItems = updates
    .map((update) => {
      const species = update.species ? ` ${escapeHtml(update.species)}` : '';
      const zone = update.zone ? ` in ${escapeHtml(update.zone)}` : '';
      const date = escapeHtml(update.updatedAt.toISOString().slice(0, 10));
      return `<li style="margin-bottom:8px;"><strong>${escapeHtml(update.status)}</strong>${species}${zone} <span style="color:#888;font-size:12px;">(${date})</span></li>`;
    })
    .join('');

  const text = updates.map((update) => {
    const species = update.species ? ` ${update.species}` : '';
    const zone = update.zone ? ` in ${update.zone}` : '';
    const date = update.updatedAt.toISOString().slice(0, 10);
    return `- ${update.status}${species}${zone} (${date})`;
  });

  return { html: `<ul style="padding-left:18px;">${htmlItems}</ul>`, text };
}

/**
 * Compile the weekly sponsor impact digest email. Returns `null` when there is
 * nothing to report (no tree updates, no highlights, and no impact metrics).
 */
export function buildWeeklySponsorDigestEmail(
  settings: WeeklySponsorDigestSettings,
  treeUpdates: WeeklyDigestTreeUpdate[],
  metrics: WeeklyDigestMetrics,
  highlights: string[]
): WeeklySponsorDigestEmail | null {
  const hasMetrics =
    metrics.treesFunded > 0 ||
    metrics.co2AbsorbedKg > 0 ||
    metrics.speciesCount > 0 ||
    (metrics.treesSurvived ?? 0) > 0;

  if (treeUpdates.length === 0 && highlights.length === 0 && !hasMetrics) {
    return null;
  }

  const { sponsorName } = settings;
  const subject = `Your weekly impact summary, ${sponsorName}`;

  const textLines: string[] = [`Hi ${sponsorName},`, '', 'Here is your weekly impact summary:', ''];

  textLines.push('Impact metrics:');
  textLines.push(`- Trees funded: ${metrics.treesFunded}`);
  textLines.push(`- CO2 absorbed: ${metrics.co2AbsorbedKg} kg`);
  textLines.push(`- Species supported: ${metrics.speciesCount}`);
  if (metrics.treesSurvived !== undefined) {
    textLines.push(`- Trees survived: ${metrics.treesSurvived}`);
  }

  if (treeUpdates.length > 0) {
    textLines.push('', 'Tree growth updates:');
    for (const update of treeUpdates) {
      const species = update.species ? ` ${update.species}` : '';
      const zone = update.zone ? ` in ${update.zone}` : '';
      const growth = update.growthNote ? ` - ${update.growthNote}` : '';
      const photo = update.photoUrl ? ` (photo: ${update.photoUrl})` : '';
      textLines.push(`- Tree ${update.treeId}${species}${zone}${growth}${photo}`);
    }
  }

  if (highlights.length > 0) {
    textLines.push('', 'Community highlights:');
    for (const highlight of highlights) {
      textLines.push(`- ${highlight}`);
    }
  }

  textLines.push('', 'Thank you for making a difference!');

  const text = textLines.join('\n');

  const htmlTreeUpdates =
    treeUpdates.length > 0
      ? `<h3>Tree growth updates</h3><ul style="list-style:none;padding:0;margin:0;">${treeUpdates
          .map((update) => {
            const species = update.species ? ` ${escapeHtml(update.species)}` : '';
            const zone = update.zone ? ` in ${escapeHtml(update.zone)}` : '';
            const growth = update.growthNote
              ? `<div style="color:#555;margin-top:2px;">${escapeHtml(update.growthNote)}</div>`
              : '';
            const photo = update.photoUrl
              ? `<div style="margin-top:6px;"><img src="${escapeHtml(update.photoUrl)}" alt="Tree ${escapeHtml(update.treeId)}" style="max-width:100%;border-radius:8px;" /></div>`
              : '';
            return `<li style="margin-bottom:16px;"><div style="font-weight:600;">Tree ${escapeHtml(update.treeId)}${species}${zone}</div>${growth}${photo}</li>`;
          })
          .join('')}</ul>`
      : '';

  const htmlHighlights =
    highlights.length > 0
      ? `<h3>Community highlights</h3><ul>${highlights
          .map((highlight) => `<li>${escapeHtml(highlight)}</li>`)
          .join('')}</ul>`
      : '';

  const survivedHtml =
    metrics.treesSurvived !== undefined
      ? `<li>Trees survived: <strong>${metrics.treesSurvived}</strong></li>`
      : '';

  const html = [
    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">',
    `<h2>Hi ${escapeHtml(sponsorName)},</h2>`,
    '<h3>Your weekly impact summary</h3>',
    '<h4>Impact metrics</h4>',
    '<ul>',
    `<li>Trees funded: <strong>${metrics.treesFunded}</strong></li>`,
    `<li>CO2 absorbed: <strong>${metrics.co2AbsorbedKg} kg</strong></li>`,
    `<li>Species supported: <strong>${metrics.speciesCount}</strong></li>`,
    survivedHtml,
    '</ul>',
    htmlTreeUpdates,
    htmlHighlights,
    '<p>Thank you for making a difference!</p>',
    '</div>',
  ].join('');

  return {
    sponsorId: settings.sponsorId,
    to: settings.email,
    subject,
    html,
    text,
    treeUpdates,
  };
}

/** Compile the personalised monthly newsletter email for a sponsor. */
export function buildMonthlyNewsletterEmail(
  content: NewsletterContent,
  settings: NewsletterSponsorSettings,
  treeUpdates: NewsletterTreeUpdate[]
): MonthlyNewsletterEmail {
  const { sponsorName } = settings;
  const subject = `${content.title} - your forest health update`;

  const treeSection = buildTreeUpdatesSection(treeUpdates);

  const text = [
    `Hi ${sponsorName},`,
    '',
    content.title,
    '',
    'Platform news:',
    ...content.news.map((item) => `- ${item}`),
    '',
    'Featured reforestation stories:',
    ...content.featuredStories.map((item) => `- ${item}`),
    '',
    'Species spotlights:',
    ...content.speciesSpotlights.map((item) => `- ${item}`),
    '',
    'Conservation tips:',
    ...content.conservationTips.map((item) => `- ${item}`),
    '',
    'Your tree updates:',
    ...treeSection.text,
    '',
    'Thank you for supporting our forests!',
  ].join('\n');

  const list = (items: string[]) =>
    items.length > 0
      ? `<ul style="padding-left:18px;">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
      : '<p style="color:#555;">Nothing to share this month.</p>';

  const html = [
    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">',
    `<h2>Hi ${escapeHtml(sponsorName)},</h2>`,
    `<h3>${escapeHtml(content.title)}</h3>`,
    '<h4>Platform news</h4>',
    list(content.news),
    '<h4>Featured reforestation stories</h4>',
    list(content.featuredStories),
    '<h4>Species spotlights</h4>',
    list(content.speciesSpotlights),
    '<h4>Conservation tips</h4>',
    list(content.conservationTips),
    '<h4>Your tree updates</h4>',
    treeSection.html,
    '<p>Thank you for supporting our forests!</p>',
    '</div>',
  ].join('');

  return {
    sponsorId: settings.sponsorId,
    to: settings.email,
    subject,
    html,
    text,
    treeUpdates,
  };
}

/**
 * Compile and send the monthly newsletter to a single sponsor. Returns `null`
 * when the sponsor has opted out of the newsletter. The `sendEmail` callback
 * performs the actual delivery.
 */
export async function sendMonthlyNewsletter(
  content: NewsletterContent,
  settings: NewsletterSponsorSettings,
  fetchTreeUpdates: (sponsorId: string) => Promise<NewsletterTreeUpdate[]>,
  sendEmail: (email: MonthlyNewsletterEmail) => Promise<void>
): Promise<MonthlyNewsletterEmail | null> {
  if (!getNewsletterPreference(settings.sponsorId)) {
    return null;
  }

  const treeUpdates = await getSponsorTreeUpdates(settings.sponsorId, fetchTreeUpdates);
  const email = buildMonthlyNewsletterEmail(content, settings, treeUpdates);

  await sendEmail(email);
  return email;
}

/**
 * Compile and send the weekly sponsor impact digest for a single sponsor. The
 * `sendEmail` callback performs the actual delivery. Returns `null` when there
 * is nothing to send.
 */
export async function sendWeeklySponsorDigest(
  settings: WeeklySponsorDigestSettings,
  data: WeeklySponsorDigestData,
  sendEmail: (email: WeeklySponsorDigestEmail) => Promise<void>
): Promise<WeeklySponsorDigestEmail | null> {
  const email = buildWeeklySponsorDigestEmail(
    settings,
    data.treeUpdates,
    data.metrics,
    data.highlights
  );

  if (!email) {
    return null;
  }

  await sendEmail(email);
  return email;
}

/**
 * Send the monthly newsletter to all opted-in sponsors. Sponsors who have
 * opted out are skipped. Intended to be invoked by a monthly scheduler.
 */
export async function sendMonthlyNewsletterToAllSponsors(
  content: NewsletterContent,
  sponsors: NewsletterSponsorSettings[],
  fetchTreeUpdates: (sponsorId: string) => Promise<NewsletterTreeUpdate[]>,
  sendEmail: (email: MonthlyNewsletterEmail) => Promise<void>
): Promise<MonthlyNewsletterEmail[]> {
  const sent: MonthlyNewsletterEmail[] = [];
  for (const settings of sponsors) {
    const email = await sendMonthlyNewsletter(content, settings, fetchTreeUpdates, sendEmail);
    if (email) {
      sent.push(email);
    }
  }
  return sent;
}

/**
 * Send weekly sponsor impact digests for all provided sponsors. Intended to be
 * invoked by a weekly scheduler.
 */
export async function sendAllWeeklySponsorDigests(
  sponsors: Array<{ settings: WeeklySponsorDigestSettings; data: WeeklySponsorDigestData }>,
  sendEmail: (email: WeeklySponsorDigestEmail) => Promise<void>
): Promise<WeeklySponsorDigestEmail[]> {
  const sent: WeeklySponsorDigestEmail[] = [];
  for (const sponsor of sponsors) {
    const email = await sendWeeklySponsorDigest(sponsor.settings, sponsor.data, sendEmail);
    if (email) {
      sent.push(email);
    }
  }
  return sent;
}

// ---------------------------------------------------------------------------
// Batch newsletter sending (#1117)
//
// Marketing email interface for sending customized newsletters to segmented
// sponsor groups (first-time, VIP, lapsed, regional).
// ---------------------------------------------------------------------------

export type SponsorSegment = 'first_time' | 'vip' | 'lapsed' | 'regional';

export interface NewsletterTemplate {
  /** Subject line; may contain `{{placeholder}}` tokens. */
  subject: string;
  /** HTML body; may contain `{{placeholder}}` tokens. */
  html: string;
  /** Optional plain-text body; may contain `{{placeholder}}` tokens. */
  text?: string;
}

export interface NewsletterRecipient {
  sponsorId: string;
  email: string;
  name?: string;
  segment?: SponsorSegment;
  /** Whether the recipient has opted out of marketing email. */
  unsubscribed?: boolean;
  /** Additional placeholder values available to the template. */
  [key: string]: unknown;
}

export interface NewsletterCampaign {
  id: string;
  /** Optional segment this campaign targets. */
  segment?: SponsorSegment;
  template: NewsletterTemplate;
}

export interface RenderedNewsletterEmail {
  sponsorId: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface BatchSendResult {
  sent: number;
  failed: number;
  skipped: number;
  errors: Array<{ sponsorId: string; error: string }>;
}

/**
 * Minimal rate limiter contract. Compatible with the limiter exported from
 * `lib/rate-limit.ts`; kept structural so this module stays dependency-free.
 */
export interface NewsletterRateLimiter {
  /** Returns true when a request is allowed, false when rate limited. */
  check(key?: string): boolean | Promise<boolean>;
}

export interface BatchNewsletterOptions {
  /** Optional rate limiter applied before each send. */
  limiter?: NewsletterRateLimiter;
  /** Optional key passed to the limiter (defaults to the campaign id). */
  limiterKey?: string;
  /** Optional delay in ms between sends. */
  delayMs?: number;
}

function substitutePlaceholders(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key: string) => {
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match;
  });
}

function recipientPlaceholderValues(recipient: NewsletterRecipient): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(recipient)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      values[key] = String(value);
    }
  }
  if (recipient.name !== undefined) {
    values.name = recipient.name;
  }
  return values;
}

/**
 * Personalise a newsletter template for a single recipient by substituting
 * `{{placeholder}}` tokens with recipient values.
 */
export function renderNewsletterEmail(
  template: NewsletterTemplate,
  recipient: NewsletterRecipient
): RenderedNewsletterEmail {
  const values = recipientPlaceholderValues(recipient);
  const subject = substitutePlaceholders(template.subject, values);
  const html = substitutePlaceholders(template.html, values);
  const text = template.text
    ? substitutePlaceholders(template.text, values)
    : html
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

  return {
    sponsorId: recipient.sponsorId,
    to: recipient.email,
    subject,
    html,
    text,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send a newsletter campaign to a batch of recipients. Unsubscribed recipients
 * are skipped, an optional rate limiter is applied before each send, and
 * progress is logged. Returns a summary of the batch.
 */
export async function sendBatchNewsletter(
  campaign: NewsletterCampaign,
  recipients: NewsletterRecipient[],
  sendEmail: (email: RenderedNewsletterEmail) => Promise<void>,
  options: BatchNewsletterOptions = {}
): Promise<BatchSendResult> {
  const result: BatchSendResult = { sent: 0, failed: 0, skipped: 0, errors: [] };
  const limiterKey = options.limiterKey ?? campaign.id;

  for (const recipient of recipients) {
    if (recipient.unsubscribed) {
      result.skipped += 1;
      continue;
    }

    if (campaign.segment && recipient.segment && recipient.segment !== campaign.segment) {
      result.skipped += 1;
      continue;
    }

    if (options.limiter) {
      const allowed = await options.limiter.check(limiterKey);
      if (!allowed) {
        result.skipped += 1;
        continue;
      }
    }

    try {
      const email = renderNewsletterEmail(campaign.template, recipient);
      await sendEmail(email);
      result.sent += 1;
    } catch (error) {
      result.failed += 1;
      result.errors.push({
        sponsorId: recipient.sponsorId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (options.delayMs && options.delayMs > 0) {
      await sleep(options.delayMs);
    }
  }

  return result;
}
