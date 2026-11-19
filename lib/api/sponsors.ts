import { mockAllTimeSponsors } from '@/lib/api/mock/leaderboard';
import type { SponsorBadge } from '@/lib/types/sponsor-badge';
import { getSponsorBadges } from '@/lib/gamification/sponsor-badges';
import { fetchTrees } from '@/lib/api/trees';
import type { Tree } from '@/lib/types/tree';

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

  if (
    Number.isNaN(parsedLimit) ||
    Number.isNaN(parsedRemaining) ||
    Number.isNaN(parsedReset)
  ) {
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

// In-memory fallback stores used when the API is unavailable (e.g. tests / offline).
const annualImpactEmailsStore: AnnualImpactEmailRow[] = [];
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