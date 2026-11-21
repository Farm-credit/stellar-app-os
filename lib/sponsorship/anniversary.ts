/**
 * Sponsorship anniversary reminders — Issue #1647
 *
 * Sends each sponsor an annual email on the anniversary of the planting date
 * of every tree they sponsored, with the latest health photo, cumulative CO₂
 * absorbed to date (from the growth timeline), and a shareable social card.
 *
 * Sponsor↔tree attribution follows the repo's deterministic mock-data
 * convention (see lib/api/sponsor-portfolio.ts): active sponsors from the
 * admin user roster are matched to planted, non-failed registry trees.
 */

import { mockAdminUsers } from '@/lib/api/mock/adminUsers';
import { getMockTrees } from '@/lib/api/mock/trees';
import { sendSponsorshipAnniversaryEmail } from '@/lib/email/sendgrid';
import { buildTreeGrowthTimeline } from '@/lib/tree-growth/timeline';
import type { Tree } from '@/lib/types/tree';
import { buildAnniversaryEmailContent, type AnniversaryEmailContent } from './anniversary-email';

export interface SponsorshipRecord {
  sponsorEmail: string;
  sponsorName: string;
  tree: Tree;
}

export interface AnniversaryReminder {
  sponsorEmail: string;
  sponsorName: string;
  tree: Tree;
  /** Anniversary number: 1 after one year, 2 after two, … */
  yearsOld: number;
  /** Original planting date, ISO-8601. */
  plantedAt: string;
  /** This year's occurrence of the planting anniversary, `YYYY-MM-DD`. */
  anniversaryDate: string;
  /** CO₂ absorbed since planting, kilograms (growth timeline impact). */
  cumulativeCo2Kg: number;
  /** Current annual sequestration rate, kilograms per year. */
  annualCo2Kg?: number;
  /** Latest health photo from the growth timeline, when available. */
  latestPhotoUrl?: string;
  /** Absolute link to the tree page. */
  shareUrl: string;
  /** Absolute URL of the generated social-card image for the tree. */
  ogImageUrl?: string;
}

export interface AnniversarySendSummary {
  /** Anniversaries falling due on the run date. */
  due: number;
  /** Emails handed to the mail provider. */
  sent: number;
  /** Due reminders suppressed because they were already sent this year. */
  skipped: number;
}

const SITE_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? 'https://farmcredit.app';

/** `'alice.johnson@greenearth.org'` → `'Alice Johnson'` */
export function displayNameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? '';
  const words = local.split(/[._\-+]/).filter(Boolean);
  if (words.length === 0) return 'Sponsor';
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** How many trees each sponsor holds in the demo attribution (1–3). */
const TREES_PER_SPONSOR_MIN = 1;
const TREES_PER_SPONSOR_SPREAD = 3;

/**
 * Deterministically attribute planted, non-failed registry trees to each
 * active sponsor. Duplicate (sponsor, tree) pairs are avoided.
 */
export function buildSponsorshipRecords(): SponsorshipRecord[] {
  const registry = getMockTrees().filter(
    (tree) => Boolean(tree.plantedAt) && tree.status !== 'failed'
  );
  const records: SponsorshipRecord[] = [];
  const seen = new Set<string>();

  for (const user of mockAdminUsers) {
    if (user.status !== 'Active') continue;
    const hash = hashString(user.email);
    const count = TREES_PER_SPONSOR_MIN + (hash % TREES_PER_SPONSOR_SPREAD);
    const sponsorName = displayNameFromEmail(user.email);

    for (let i = 0; i < count && registry.length > 0; i++) {
      const tree = registry[(hash + i) % registry.length];
      const key = `${user.email}|${tree.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      records.push({ sponsorEmail: user.email, sponsorName, tree });
    }
  }

  return records;
}

/** Does `now` fall on the (post-planting) annual anniversary of `plantedAt`? */
export function isAnniversaryOn(plantedAt: string, now: Date): boolean {
  const planted = new Date(plantedAt);
  if (Number.isNaN(planted.getTime())) return false;
  if (now.getUTCFullYear() <= planted.getUTCFullYear()) return false;
  return planted.getUTCMonth() === now.getUTCMonth() && planted.getUTCDate() === now.getUTCDate();
}

/** Full years elapsed between planting and `now`. */
export function yearsSincePlanted(plantedAt: string, now: Date): number {
  const planted = new Date(plantedAt);
  if (Number.isNaN(planted.getTime())) return 0;
  const anniversaryCount = now.getUTCFullYear() - planted.getUTCFullYear();
  return Math.max(0, anniversaryCount);
}

/**
 * Due reminders for the given records on `now`'s calendar day (UTC), enriched
 * with cumulative CO₂ and the latest health photo from the growth timeline.
 */
export function findDueAnniversaries(
  records: SponsorshipRecord[],
  now: Date
): AnniversaryReminder[] {
  const due: AnniversaryReminder[] = [];

  for (const record of records) {
    if (!record.tree.plantedAt) continue;
    // A tree that died is not celebrated — records are also filtered at
    // attribution time, this guards injected/legacy records too.
    if (record.tree.status === 'failed') continue;
    if (!isAnniversaryOn(record.tree.plantedAt, now)) continue;

    const timeline = buildTreeGrowthTimeline(record.tree);
    const latestPhoto = timeline.photos.length
      ? timeline.photos[timeline.photos.length - 1]
      : undefined;
    const planted = new Date(record.tree.plantedAt);

    due.push({
      sponsorEmail: record.sponsorEmail,
      sponsorName: record.sponsorName,
      tree: record.tree,
      yearsOld: yearsSincePlanted(record.tree.plantedAt, now),
      plantedAt: record.tree.plantedAt,
      anniversaryDate: `${now.getUTCFullYear()}-${String(planted.getUTCMonth() + 1).padStart(2, '0')}-${String(planted.getUTCDate()).padStart(2, '0')}`,
      cumulativeCo2Kg: timeline.impact.cumulativeCo2Kg,
      annualCo2Kg: record.tree.co2OffsetKgPerYear,
      latestPhotoUrl: latestPhoto?.imageUrl,
      shareUrl: `${SITE_URL()}/trees/${encodeURIComponent(record.tree.treeId)}`,
      ogImageUrl: `${SITE_URL()}/trees/${encodeURIComponent(record.tree.treeId)}/opengraph-image`,
    });
  }

  return due;
}

/** Reminders already emailed this year: `${email}|${treeId}|${year}`. */
const sentLedger = new Set<string>();

function ledgerKey(reminder: AnniversaryReminder): string {
  return `${reminder.sponsorEmail}|${reminder.tree.treeId}|${reminder.anniversaryDate.slice(0, 4)}`;
}

/** Test helper — forget which anniversaries were already emailed. */
export function resetAnniversaryLedger(): void {
  sentLedger.clear();
}

export function buildReminderEmail(reminder: AnniversaryReminder): AnniversaryEmailContent {
  return buildAnniversaryEmailContent({
    sponsorName: reminder.sponsorName,
    treeId: reminder.tree.treeId,
    species: reminder.tree.species,
    projectName: reminder.tree.projectName,
    yearsOld: reminder.yearsOld,
    plantedAt: reminder.plantedAt,
    cumulativeCo2Kg: reminder.cumulativeCo2Kg,
    annualCo2Kg: reminder.annualCo2Kg,
    latestPhotoUrl: reminder.latestPhotoUrl,
    shareUrl: reminder.shareUrl,
    ogImageUrl: reminder.ogImageUrl,
  });
}

export interface SendAnniversaryOptions {
  /** Injectable clock (tests). */
  now?: Date;
  /** Inject the record set (tests). */
  records?: SponsorshipRecord[];
}

/**
 * Send one anniversary email per due reminder, at most once per tree per
 * year. Returns how many were due / sent / suppressed.
 */
export async function sendDueAnniversaryReminders(
  options: SendAnniversaryOptions = {}
): Promise<AnniversarySendSummary> {
  const now = options.now ?? new Date();
  const records = options.records ?? buildSponsorshipRecords();
  const due = findDueAnniversaries(records, now);

  let sent = 0;
  let skipped = 0;

  for (const reminder of due) {
    const key = ledgerKey(reminder);
    if (sentLedger.has(key)) {
      skipped += 1;
      continue;
    }

    const content = buildReminderEmail(reminder);
    const delivered = await sendSponsorshipAnniversaryEmail({
      to: reminder.sponsorEmail,
      ...content,
    });

    // Record the attempt either way so a misconfigured mail provider does not
    // produce a retry storm on every run.
    sentLedger.add(key);
    if (delivered) sent += 1;
  }

  return { due: due.length, sent, skipped };
}
