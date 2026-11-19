import { mockAllTimeSponsors } from '@/lib/api/mock/leaderboard';
import type { SponsorBadge } from '@/lib/types/sponsor-badge';
import { getSponsorBadges } from '@/lib/gamification/sponsor-badges';
import { fetchTrees } from '@/lib/api/trees';
import type { Tree } from '@/lib/types/tree';
import { CO2_KG_PER_TREE } from '@/lib/constants/impact';
import { SPECIES } from '@/lib/constants/species';
import { sendNotification } from '@/lib/notifications';

export interface SponsorProfile {
  address: string;
  name?: string;
  avatarUrl?: string;
  totalTrees: number;
  co2Offset: number;
  badges: SponsorBadge[];
}

export interface AnnualImpactSummary {
  sponsorId: string;
  year: number;
  treesFunded: number;
  co2Absorbed: number;
  speciesDiversity: number;
  milestonesReached: string[];
}

export interface AnnualImpactEmailRow {
  sponsorId: string;
  year: number;
  status: 'pending' | 'sent' | 'failed';
}

export interface WaitlistEntry {
  sponsorId: string;
  region: string;
  treeId?: string;
  position: number;
  joinedAt: string;
}

export interface WaitlistAssignment {
  sponsorId: string;
  region: string;
  treeId: string;
  assignedAt: string;
}

const ANNUAL_IMPACT_EMAILS_ENDPOINT = '/api/sponsors/annual-impact-emails';
const WAITLIST_ENDPOINT = '/api/sponsors/waitlist';

// In-memory fallback stores used when the API is unavailable (e.g. tests / offline).
const annualImpactEmailsStore: AnnualImpactEmailRow[] = [];
const annualImpactSummariesStore: AnnualImpactSummary[] = [];
const waitlistStore: WaitlistEntry[] = [];

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

export function getSponsorProfile(address: string): SponsorProfile | undefined {
  const sponsor = mockAllTimeSponsors.find(
    (entry) => entry.address.toLowerCase() === address.toLowerCase()
  );

  if (!sponsor) return undefined;

  return {
    ...sponsor,
    badges: getSponsorBadges(sponsor.totalTrees),
  };
}

/**
 * Returns the trees sponsored by the given address.
 *
 * Used by the monthly forest health newsletter to build the personalised
 * section showing the subscriber's own tree updates.
 */
export async function getSponsorTreeUpdates(address: string): Promise<Tree[]> {
  if (!address) return [];

  const normalized = address.toLowerCase();

  const trees = await fetchTrees({ sponsor: address });

  return trees.filter(
    (tree) => tree.sponsor?.toLowerCase() === normalized
  );
}

function isTreeInYear(tree: Tree, year: number): boolean {
  const dateValue = tree.plantedAt ?? tree.createdAt;
  if (!dateValue) return false;
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getUTCFullYear() === year;
}

/**
 * Aggregates a sponsor's yearly impact stats from their sponsored trees.
 */
export async function aggregateAnnualImpact(
  sponsorId: string,
  year: number
): Promise<AnnualImpactSummary> {
  const trees = await getSponsorTreeUpdates(sponsorId);
  const yearTrees = trees.filter((tree) => isTreeInYear(tree, year));

  const treesFunded = yearTrees.length;
  const co2Absorbed = treesFunded * CO2_KG_PER_TREE;

  const speciesSet = new Set<string>();
  for (const tree of yearTrees) {
    const speciesId = tree.speciesId ?? tree.species;
    if (speciesId) speciesSet.add(speciesId);
  }
  const speciesDiversity = speciesSet.size;

  const milestonesReached: string[] = [];
  if (treesFunded >= 1) milestonesReached.push('First tree of the year');
  if (treesFunded >= 10) milestonesReached.push('10 trees funded');
  if (treesFunded >= 50) milestonesReached.push('50 trees funded');
  if (treesFunded >= 100) milestonesReached.push('100 trees funded');
  if (speciesDiversity >= 5) milestonesReached.push('5+ species supported');
  if (speciesDiversity >= SPECIES.length) {
    milestonesReached.push('Every species supported');
  }

  return {
    sponsorId,
    year,
    treesFunded,
    co2Absorbed,
    speciesDiversity,
    milestonesReached,
  };
}

/**
 * Builds a shareable impact image URL for the given summary.
 */
export function buildImpactImageUrl(summary: AnnualImpactSummary): string {
  const params = new URLSearchParams({
    sponsor: summary.sponsorId,
    year: String(summary.year),
    trees: String(summary.treesFunded),
    co2: String(summary.co2Absorbed),
    species: String(summary.speciesDiversity),
  });
  return `/api/sponsors/impact-image?${params.toString()}`;
}

export function getAnnualImpactSummary(
  sponsorId: string,
  year: number
): AnnualImpactSummary | undefined {
  const normalized = normalizeAddress(sponsorId);
  return annualImpactSummariesStore.find(
    (entry) =>
      normalizeAddress(entry.sponsorId) === normalized && entry.year === year
  );
}

/**
 * Persists an AnnualImpactSummary idempotently (one record per sponsor/year).
 */
export function persistAnnualImpactSummary(
  summary: AnnualImpactSummary
): AnnualImpactSummary {
  const existing = getAnnualImpactSummary(summary.sponsorId, summary.year);
  if (existing) return existing;
  annualImpactSummariesStore.push(summary);
  return summary;
}

/**
 * Sends the annual impact summary email for a single sponsor.
 * Returns the persisted summary, or undefined if already sent this year.
 */
export async function sendAnnualImpactEmail(
  sponsorId: string,
  year: number
): Promise<AnnualImpactSummary | undefined> {
  const normalized = normalizeAddress(sponsorId);
  const alreadySent = annualImpactEmailsStore.find(
    (row) =>
      normalizeAddress(row.sponsorId) === normalized &&
      row.year === year &&
      row.status === 'sent'
  );
  if (alreadySent) return undefined;

  const profile = getSponsorProfile(sponsorId);
  const summary = persistAnnualImpactSummary(
    await aggregateAnnualImpact(sponsorId, year)
  );
  const imageUrl = buildImpactImageUrl(summary);

  const row: AnnualImpactEmailRow = {
    sponsorId: summary.sponsorId,
    year,
    status: 'pending',
  };
  annualImpactEmailsStore.push(row);

  try {
    await sendNotification({
      type: 'annual-impact-summary',
      to: sponsorId,
      data: {
        name: profile?.name ?? 'Tree sponsor',
        year,
        treesFunded: summary.treesFunded,
        co2Absorbed: summary.co2Absorbed,
        speciesDiversity: summary.speciesDiversity,
        milestonesReached: summary.milestonesReached,
        imageUrl,
      },
    });
    row.status = 'sent';
  } catch {
    row.status = 'failed';
  }

  return summary;
}

/**
 * Annual impact summary job. Intended to run on December 20 each year.
 * Sends a personalised year-in-review email to every sponsor.
 */
export async function runAnnualImpactSummaryJob(
  year: number = new Date().getUTCFullYear()
): Promise<AnnualImpactSummary[]> {
  const results: AnnualImpactSummary[] = [];
  for (const sponsor of mockAllTimeSponsors) {
    const summary = await sendAnnualImpactEmail(sponsor.address, year);
    if (summary) results.push(summary);
  }
  return results;
}

/**
 * Returns true when the given date is the annual impact send day (Dec 20).
 */
export function isAnnualImpactSendDay(date: Date = new Date()): boolean {
  return date.getUTCMonth() === 11 && date.getUTCDate() === 20;
}

function getWaitlistForRegion(region: string): WaitlistEntry[] {
  const normalized = region.toLowerCase();
  return waitlistStore
    .filter((entry) => entry.region.toLowerCase() === normalized)
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
}

/**
 * Adds a sponsor to the waitlist for an oversubscribed planting zone.
 * Returns the entry with its assigned waitlist position.
 */
export function joinWaitlist(sponsorId: string, region: string): WaitlistEntry {
  const normalizedSponsor = normalizeAddress(sponsorId);
  const normalizedRegion = region.toLowerCase();

  const existing = waitlistStore.find(
    (entry) =>
      normalizeAddress(entry.sponsorId) === normalizedSponsor &&
      entry.region.toLowerCase() === normalizedRegion
  );
  if (existing) return existing;

  const position = getWaitlistForRegion(region).length + 1;
  const entry: WaitlistEntry = {
    sponsorId,
    region,
    position,
    joinedAt: new Date().toISOString(),
  };
  waitlistStore.push(entry);
  return entry;
}

/**
 * Returns the sponsor's waitlist position for a region, if any.
 */
export function getWaitlistPosition(
  sponsorId: string,
  region: string
): number | undefined {
  const normalizedSponsor = normalizeAddress(sponsorId);
  const normalizedRegion = region.toLowerCase();
  const entry = waitlistStore.find(
    (item) =>
      normalizeAddress(item.sponsorId) === normalizedSponsor &&
      item.region.toLowerCase() === normalizedRegion
  );
  return entry?.position;
}

/**
 * Assigns trees from the waitlist FIFO when a new planting batch opens.
 * Sends an assignment email to each sponsor that receives a tree.
 */
export async function assignWaitlistTrees(
  region: string,
  treeIds: string[]
): Promise<WaitlistAssignment[]> {
  const queue = getWaitlistForRegion(region).filter((entry) => !entry.treeId);
  const assignments: WaitlistAssignment[] = [];
  const available = [...treeIds];

  for (const entry of queue) {
    const treeId = available.shift();
    if (!treeId) break;

    entry.treeId = treeId;
    const assignment: WaitlistAssignment = {
      sponsorId: entry.sponsorId,
      region: entry.region,
      treeId,
      assignedAt: new Date().toISOString(),
    };
    assignments.push(assignment);

    try {
      await sendNotification({
        type: 'waitlist-tree-assigned',
        to: entry.sponsorId,
        data: {
          region: entry.region,
          treeId,
        },
      });
    } catch {
      // Assignment still stands even if the notification fails.
    }
  }

  // Recompute positions for remaining waiters.
  const remaining = getWaitlistForRegion(region).filter((entry) => !entry.treeId);
  remaining.forEach((entry, index) => {
    entry.position = index + 1;
  });

  return assignments;
}