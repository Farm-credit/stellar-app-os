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