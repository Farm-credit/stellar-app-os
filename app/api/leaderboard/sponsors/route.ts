/**
 * GET /api/leaderboard/sponsors — Issue #1100
 *
 * Live sponsor leaderboard ranked by trees sponsored.
 *
 *   ?scope=global|region|tree-type   (default: global)
 *   &region=Africa|Asia|Europe|Latin America|North America|Oceania
 *   &treeType=Fruit|Hardwood|Mangrove|Agroforestry|Native
 *   &limit=1..100                    (default: 25)
 *
 * 200 LeaderboardSnapshot — rankings with 24h movement, scope totals and
 *     the most recent sponsorships. Never cached: clients poll for live data.
 * 400 { error, details: string[] }
 */

import { NextResponse } from 'next/server';
import { buildLeaderboardSnapshot, parseLeaderboardQuery } from '@/lib/leaderboard/liveRankings';
import { getSponsorshipStore } from '@/lib/leaderboard/sponsorshipStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request): NextResponse {
  const parsed = parseLeaderboardQuery(new URL(request.url).searchParams);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: 'Invalid leaderboard query', details: parsed.errors },
      { status: 400 }
    );
  }

  const store = getSponsorshipStore();
  const now = new Date();
  store.tick(now);

  return NextResponse.json(buildLeaderboardSnapshot([...store.events()], parsed.query, now), {
    headers: { 'Cache-Control': 'no-store' },
  });
}
