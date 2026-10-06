/**
 * Sponsor leaderboard — global live rankings by trees sponsored (Issue #1100)
 *
 * Pure ranking logic: aggregates sponsorship events into rankings globally,
 * per region or per tree type, and works out how each sponsor moved compared
 * with a earlier point in time. Data comes from `./sponsorshipStore`.
 */

import { CO2_KG_PER_TREE_PER_YEAR } from '@/lib/constants/impact';

export const SPONSOR_REGIONS = [
  'Africa',
  'Asia',
  'Europe',
  'Latin America',
  'North America',
  'Oceania',
] as const;
export type SponsorRegion = (typeof SPONSOR_REGIONS)[number];

export const TREE_TYPES = ['Fruit', 'Hardwood', 'Mangrove', 'Agroforestry', 'Native'] as const;
export type TreeType = (typeof TREE_TYPES)[number];

export type LeaderboardScope = 'global' | 'region' | 'tree-type';

export interface SponsorshipEvent {
  id: string;
  sponsorId: string;
  sponsorName: string;
  region: SponsorRegion;
  treeType: TreeType;
  trees: number;
  occurredAt: string;
}

export interface SponsorRanking {
  rank: number;
  sponsorId: string;
  sponsorName: string;
  region: SponsorRegion;
  trees: number;
  co2KgPerYear: number;
  topTreeType: TreeType;
  lastSponsoredAt: string;
  /** Places gained (positive) or lost (negative) since the comparison point. */
  movement: number;
  /** True when the sponsor was not ranked at the comparison point. */
  isNew: boolean;
}

export interface LeaderboardQuery {
  scope: LeaderboardScope;
  region?: SponsorRegion;
  treeType?: TreeType;
  limit: number;
}

export interface LeaderboardSnapshot {
  query: LeaderboardQuery;
  generatedAt: string;
  totals: { trees: number; sponsors: number; co2KgPerYear: number };
  rankings: SponsorRanking[];
  /** Most recent sponsorships within the scope, newest first. */
  recent: SponsorshipEvent[];
}

export const DEFAULT_LEADERBOARD_LIMIT = 25;
export const MAX_LEADERBOARD_LIMIT = 100;
/** Movement is measured against the rankings this long ago. */
export const MOVEMENT_WINDOW_MS = 24 * 60 * 60 * 1000;

export type ParsedLeaderboardQuery =
  { ok: true; query: LeaderboardQuery } | { ok: false; errors: string[] };

export function parseLeaderboardQuery(params: URLSearchParams): ParsedLeaderboardQuery {
  const errors: string[] = [];

  const scope = (params.get('scope') ?? 'global') as LeaderboardScope;
  if (!['global', 'region', 'tree-type'].includes(scope)) {
    errors.push('scope must be one of global, region, tree-type');
  }

  const region = params.get('region') ?? undefined;
  if (scope === 'region' && !region) errors.push('region is required when scope=region');
  if (region && !SPONSOR_REGIONS.includes(region as SponsorRegion)) {
    errors.push(`region must be one of ${SPONSOR_REGIONS.join(', ')}`);
  }

  const treeType = params.get('treeType') ?? undefined;
  if (scope === 'tree-type' && !treeType) errors.push('treeType is required when scope=tree-type');
  if (treeType && !TREE_TYPES.includes(treeType as TreeType)) {
    errors.push(`treeType must be one of ${TREE_TYPES.join(', ')}`);
  }

  const rawLimit = params.get('limit');
  const limit = rawLimit === null ? DEFAULT_LEADERBOARD_LIMIT : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LEADERBOARD_LIMIT) {
    errors.push(`limit must be an integer between 1 and ${MAX_LEADERBOARD_LIMIT}`);
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    query: {
      scope,
      region: scope === 'region' ? (region as SponsorRegion) : undefined,
      treeType: scope === 'tree-type' ? (treeType as TreeType) : undefined,
      limit,
    },
  };
}

export function matchesQuery(event: SponsorshipEvent, query: LeaderboardQuery): boolean {
  if (query.scope === 'region') return event.region === query.region;
  if (query.scope === 'tree-type') return event.treeType === query.treeType;
  return true;
}

interface SponsorAggregate {
  sponsorId: string;
  sponsorName: string;
  region: SponsorRegion;
  trees: number;
  byType: Map<TreeType, number>;
  lastSponsoredAt: string;
}

function aggregate(events: SponsorshipEvent[]): SponsorAggregate[] {
  const bySponsor = new Map<string, SponsorAggregate>();
  for (const event of events) {
    let agg = bySponsor.get(event.sponsorId);
    if (!agg) {
      agg = {
        sponsorId: event.sponsorId,
        sponsorName: event.sponsorName,
        region: event.region,
        trees: 0,
        byType: new Map(),
        lastSponsoredAt: event.occurredAt,
      };
      bySponsor.set(event.sponsorId, agg);
    }
    agg.trees += event.trees;
    agg.byType.set(event.treeType, (agg.byType.get(event.treeType) ?? 0) + event.trees);
    if (event.occurredAt > agg.lastSponsoredAt) agg.lastSponsoredAt = event.occurredAt;
  }
  return [...bySponsor.values()];
}

/**
 * Ranks sponsors by trees sponsored using standard competition ranking:
 * sponsors with equal totals share a rank and the next rank is skipped
 * (1, 2, 2, 4). Ties are listed alphabetically.
 */
export function rankSponsors(
  events: SponsorshipEvent[]
): Omit<SponsorRanking, 'movement' | 'isNew'>[] {
  const sorted = aggregate(events).sort(
    (a, b) => b.trees - a.trees || a.sponsorName.localeCompare(b.sponsorName)
  );

  let previousTrees = Number.NaN;
  let previousRank = 0;
  return sorted.map((agg, index) => {
    const rank = agg.trees === previousTrees ? previousRank : index + 1;
    previousTrees = agg.trees;
    previousRank = rank;

    const topTreeType = [...agg.byType.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    )[0][0];

    return {
      rank,
      sponsorId: agg.sponsorId,
      sponsorName: agg.sponsorName,
      region: agg.region,
      trees: agg.trees,
      co2KgPerYear: agg.trees * CO2_KG_PER_TREE_PER_YEAR,
      topTreeType,
      lastSponsoredAt: agg.lastSponsoredAt,
    };
  });
}

export function buildLeaderboardSnapshot(
  allEvents: SponsorshipEvent[],
  query: LeaderboardQuery,
  now: Date = new Date()
): LeaderboardSnapshot {
  const nowIso = now.toISOString();
  const cutoff = new Date(now.getTime() - MOVEMENT_WINDOW_MS).toISOString();

  const events = allEvents.filter((e) => matchesQuery(e, query) && e.occurredAt <= nowIso);
  const current = rankSponsors(events);
  const previous = new Map(
    rankSponsors(events.filter((e) => e.occurredAt <= cutoff)).map((r) => [r.sponsorId, r.rank])
  );

  const rankings: SponsorRanking[] = current.slice(0, query.limit).map((r) => {
    const before = previous.get(r.sponsorId);
    return {
      ...r,
      movement: before === undefined ? 0 : before - r.rank,
      isNew: before === undefined,
    };
  });

  const trees = events.reduce((sum, e) => sum + e.trees, 0);

  return {
    query,
    generatedAt: nowIso,
    totals: {
      trees,
      sponsors: current.length,
      co2KgPerYear: trees * CO2_KG_PER_TREE_PER_YEAR,
    },
    rankings,
    recent: [...events]
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id))
      .slice(0, 8),
  };
}
