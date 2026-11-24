import { mockAllTimeSponsors } from '@/lib/api/mock/leaderboard';
import { fetchTrees } from '@/lib/api/trees';
import type { Tree } from '@/lib/types/tree';
import { CO2_KG_PER_TREE } from '@/lib/constants/impact';
import { SPECIES } from '@/lib/constants/species';
import { sendNotification } from '@/lib/notifications';
import { getSponsorProfile } from './sponsor-profile';

export { getSponsorProfile, type SponsorProfile } from './sponsor-profile';

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

export interface SponsorNewsletterPreference {
  sponsorId: string;
  optIn: boolean;
  updatedAt: string;
}

export type SponsorSegment = 'first_time' | 'vip' | 'lapsed' | 'regional';

export interface SponsorDigestSettings {
  sponsorId: string;
  email?: string;
  weeklyDigestEnabled: boolean;
  updatedAt: string;
}

export interface WeeklyDigestTreeUpdate {
  treeId: string;
  speciesId?: string;
  region?: string;
  plantedAt?: string;
  photoUrl?: string;
}

export interface WeeklySponsorDigestData {
  sponsorId: string;
  weekStart: string;
  weekEnd: string;
  treeUpdates: WeeklyDigestTreeUpdate[];
  impactMetrics: {
    treesFunded: number;
    newTreesThisWeek: number;
    co2Offset: number;
  };
  communityHighlights: {
    milestonesReached: string[];
    speciesDiversity: number;
  };
}

export interface SponsorSegmentMember {
  sponsorId: string;
  email?: string;
}

export interface PersonalisedNewsletterSection {
  sponsorId: string;
  treeUpdates: Tree[];
  totalTrees: number;
}

const PUBLIC_API_V1_ENDPOINT = '/api/v1';

export interface PublicApiAuth {
  /** API key issued to the third-party integration. */
  apiKey?: string;
  /** OAuth2 bearer token, used instead of (or alongside) an API key. */
  accessToken?: string;
}

export interface RateLimitInfo {
  /** Maximum number of requests allowed in the current window. */
  limit: number;
  /** Requests remaining in the current window. */
  remaining: number;
  /** Unix timestamp (seconds) when the current window resets. */
  reset: number;
}

export interface PublicApiResponse<T> {
  data: T;
  rateLimit?: RateLimitInfo;
}

export interface CreateSponsorshipInput {
  treeId: string;
  sponsorAddress: string;
  amount: number;
  currency?: string;
  message?: string;
}

export interface Sponsorship {
  id: string;
  treeId: string;
  sponsorAddress: string;
  amount: number;
  currency: string;
  message?: string;
  createdAt: string;
}

function buildPublicApiHeaders(auth: PublicApiAuth): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (auth.apiKey) {
    headers['X-API-Key'] = auth.apiKey;
  }

  if (auth.accessToken) {
    headers.Authorization = `Bearer ${auth.accessToken}`;
  }

  return headers;
}

function parseRateLimit(headers: Headers): RateLimitInfo | undefined {
  const limit = headers.get('X-RateLimit-Limit');
  const remaining = headers.get('X-RateLimit-Remaining');
  const reset = headers.get('X-RateLimit-Reset');

  if (limit === null || remaining === null || reset === null) {
    return undefined;
  }

  const parsedLimit = Number(limit);
  const parsedRemaining = Number(remaining);
  const parsedReset = Number(reset);

  if (Number.isNaN(parsedLimit) || Number.isNaN(parsedRemaining) || Number.isNaN(parsedReset)) {
    return undefined;
  }

  return { limit: parsedLimit, remaining: parsedRemaining, reset: parsedReset };
}

/**
 * Creates a sponsorship through the public v1 API.
 *
 * Authenticates with an API key and/or OAuth2 bearer token and surfaces the
 * rate-limit headers so callers can drive the quota dashboard.
 */
export async function createSponsorship(
  input: CreateSponsorshipInput,
  auth: PublicApiAuth
): Promise<PublicApiResponse<Sponsorship>> {
  const response = await fetch(`${PUBLIC_API_V1_ENDPOINT}/sponsorships`, {
    method: 'POST',
    headers: buildPublicApiHeaders(auth),
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Failed to create sponsorship: ${response.status}`);
  }

  const data = (await response.json()) as Sponsorship;

  return { data, rateLimit: parseRateLimit(response.headers) };
}

// Threshold (in funded trees) at which a sponsor is considered a VIP.
export const VIP_TREE_THRESHOLD = 50;
// A sponsor with no tree activity within this window is considered lapsed.
export const LAPSED_INACTIVITY_MONTHS = 12;

// In-memory fallback stores used when the API is unavailable (e.g. tests / offline).
const annualImpactEmailsStore: AnnualImpactEmailRow[] = [];
const annualImpactSummariesStore: AnnualImpactSummary[] = [];
const waitlistStore: WaitlistEntry[] = [];
const newsletterPreferencesStore: SponsorNewsletterPreference[] = [];
const digestSettingsStore: SponsorDigestSettings[] = [];

function normalizeAddress(address: string): string {
  return address.toLowerCase();
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

  return trees.filter((tree) => tree.sponsor?.toLowerCase() === normalized);
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
    (entry) => normalizeAddress(entry.sponsorId) === normalized && entry.year === year
  );
}

/**
 * Persists an AnnualImpactSummary idempotently (one record per sponsor/year).
 */
export function persistAnnualImpactSummary(summary: AnnualImpactSummary): AnnualImpactSummary {
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
      normalizeAddress(row.sponsorId) === normalized && row.year === year && row.status === 'sent'
  );
  if (alreadySent) return undefined;

  const profile = getSponsorProfile(sponsorId);
  const summary = persistAnnualImpactSummary(await aggregateAnnualImpact(sponsorId, year));
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

/**
 * Returns the sponsor's monthly newsletter preference.
 * Sponsors are opted in by default until they explicitly opt out.
 */
export function getNewsletterPreference(sponsorId: string): SponsorNewsletterPreference {
  const normalized = normalizeAddress(sponsorId);
  const existing = newsletterPreferencesStore.find(
    (entry) => normalizeAddress(entry.sponsorId) === normalized
  );
  if (existing) return existing;

  return {
    sponsorId,
    optIn: true,
    updatedAt: new Date(0).toISOString(),
  };
}

function getTreeDate(tree: Tree): Date | undefined {
  const dateValue = tree.plantedAt ?? tree.createdAt;
  if (!dateValue) return undefined;
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed;
}

function getTreePhotoUrl(tree: Tree): string | undefined {
  const candidate = tree as Tree & {
    photoUrl?: string;
    photo?: string;
    imageUrl?: string;
  };
  return candidate.photoUrl ?? candidate.photo ?? candidate.imageUrl;
}

function getTreeRegion(tree: Tree): string | undefined {
  const candidate = tree as Tree & { region?: string; zone?: string };
  return candidate.region ?? candidate.zone;
}

/**
 * Aggregates a sponsor's weekly digest data: this week's tree updates (with
 * photo URLs when available), impact metrics, and community highlights.
 */
export async function getWeeklySponsorDigestData(
  sponsorId: string,
  weekStart: Date
): Promise<WeeklySponsorDigestData> {
  const start = new Date(weekStart);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);

  const trees = await getSponsorTreeUpdates(sponsorId);

  const treeUpdates: WeeklyDigestTreeUpdate[] = [];
  let newTreesThisWeek = 0;
  const speciesSet = new Set<string>();

  for (const tree of trees) {
    const date = getTreeDate(tree);
    if (!date) continue;

    const speciesId = tree.speciesId ?? tree.species;
    if (speciesId) speciesSet.add(speciesId);

    if (date >= start && date < end) {
      newTreesThisWeek += 1;
      treeUpdates.push({
        treeId: tree.id,
        speciesId,
        region: getTreeRegion(tree),
        plantedAt: date.toISOString(),
        photoUrl: getTreePhotoUrl(tree),
      });
    }
  }

  const treesFunded = trees.length;
  const co2Offset = treesFunded * CO2_KG_PER_TREE;
  const speciesDiversity = speciesSet.size;

  const milestonesReached: string[] = [];
  if (newTreesThisWeek >= 1) milestonesReached.push('New tree planted this week');
  if (newTreesThisWeek >= 5) milestonesReached.push('5 trees planted this week');
  if (treesFunded >= 10) milestonesReached.push('10 trees funded');
  if (treesFunded >= 50) milestonesReached.push('50 trees funded');
  if (speciesDiversity >= 5) milestonesReached.push('5+ species supported');

  return {
    sponsorId,
    weekStart: start.toISOString(),
    weekEnd: end.toISOString(),
    treeUpdates,
    impactMetrics: {
      treesFunded,
      newTreesThisWeek,
      co2Offset,
    },
    communityHighlights: {
      milestonesReached,
      speciesDiversity,
    },
  };
}

/**
 * Updates the sponsor's monthly newsletter opt-in/out preference.
 */
export function updateNewsletterPreference(
  sponsorId: string,
  optIn: boolean
): SponsorNewsletterPreference {
  const normalized = normalizeAddress(sponsorId);
  const existing = newsletterPreferencesStore.find(
    (entry) => normalizeAddress(entry.sponsorId) === normalized
  );

  if (existing) {
    existing.optIn = optIn;
    existing.updatedAt = new Date().toISOString();
    return existing;
  }

  const created: SponsorNewsletterPreference = {
    sponsorId,
    optIn,
    updatedAt: new Date().toISOString(),
  };
  newsletterPreferencesStore.push(created);
  return created;
}

/**
 * Computes the marketing segments a sponsor belongs to based on their
 * sponsorship history and tree data.
 */
export async function computeSponsorSegments(sponsorId: string): Promise<SponsorSegment[]> {
  const segments: SponsorSegment[] = [];
  const trees = await getSponsorTreeUpdates(sponsorId);
  const totalTrees = trees.length;

  if (totalTrees === 1) segments.push('first_time');
  if (totalTrees >= VIP_TREE_THRESHOLD) segments.push('vip');

  const now = Date.now();
  const lapsedCutoff = new Date(now);
  lapsedCutoff.setUTCMonth(lapsedCutoff.getUTCMonth() - LAPSED_INACTIVITY_MONTHS);

  let lastActivity: Date | undefined;
  for (const tree of trees) {
    const date = getTreeDate(tree);
    if (date && (!lastActivity || date > lastActivity)) lastActivity = date;
  }

  if (!lastActivity || lastActivity < lapsedCutoff) {
    segments.push('lapsed');
  }

  if (trees.some((tree) => Boolean(getTreeRegion(tree)))) {
    segments.push('regional');
  }

  return segments;
}

/**
 * Returns the sponsors (id + email) that belong to the given segment,
 * optionally filtered by region.
 */
export async function getSponsorsBySegment(
  segment: SponsorSegment,
  region?: string
): Promise<SponsorSegmentMember[]> {
  const normalizedRegion = region?.toLowerCase();
  const members: SponsorSegmentMember[] = [];

  for (const sponsor of mockAllTimeSponsors) {
    const segments = await computeSponsorSegments(sponsor.address);
    if (!segments.includes(segment)) continue;

    if (normalizedRegion) {
      const trees = await getSponsorTreeUpdates(sponsor.address);
      const inRegion = trees.some(
        (tree) => getTreeRegion(tree)?.toLowerCase() === normalizedRegion
      );
      if (!inRegion) continue;
    }

    members.push({
      sponsorId: sponsor.address,
      email: (sponsor as { email?: string }).email,
    });
  }

  return members;
}

/**
 * Returns the digest settings for a sponsor, if configured.
 */
export function getSponsorDigestSettings(sponsorId: string): SponsorDigestSettings | undefined {
  const normalized = normalizeAddress(sponsorId);
  return digestSettingsStore.find((entry) => normalizeAddress(entry.sponsorId) === normalized);
}

/**
 * Persists a sponsor's weekly digest preference (upsert by sponsor).
 */
export function setSponsorDigestSettings(
  sponsorId: string,
  weeklyDigestEnabled: boolean,
  email?: string
): SponsorDigestSettings {
  const existing = getSponsorDigestSettings(sponsorId);
  if (existing) {
    existing.weeklyDigestEnabled = weeklyDigestEnabled;
    if (email !== undefined) existing.email = email;
    existing.updatedAt = new Date().toISOString();
    return existing;
  }

  const settings: SponsorDigestSettings = {
    sponsorId,
    email,
    weeklyDigestEnabled,
    updatedAt: new Date().toISOString(),
  };
  digestSettingsStore.push(settings);
  return settings;
}

/**
 * Builds the personalised section of the monthly forest health newsletter,
 * showing the subscriber's own tree updates.
 */
export async function getPersonalisedNewsletterSection(
  sponsorId: string
): Promise<PersonalisedNewsletterSection> {
  const treeUpdates = await getSponsorTreeUpdates(sponsorId);
  return {
    sponsorId,
    treeUpdates,
    totalTrees: treeUpdates.length,
  };
}

/**
 * Returns the sponsors that have opted in to the weekly impact digest.
 */
export function getSponsorsWithWeeklyDigestEnabled(): SponsorDigestSettings[] {
  return digestSettingsStore.filter((entry) => entry.weeklyDigestEnabled);
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
export function getWaitlistPosition(sponsorId: string, region: string): number | undefined {
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
