// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * GET /api/challenges/leaderboard — Issue #1361
 *
 * Standings for the active corporate offset challenge. Employee teams are
 * ranked by offset-per-employee (`totalOffsetTonnes / employeeCount`) and the
 * team with the best ratio is returned as `winner`; teams with no employees are
 * ineligible and ranked last.
 *
 *   ?limit=1..100   (default: 25)
 *
 * 200 { challengeId, metric, generatedAt, lastUpdated, limit, totals, winner,
 *       entries, totalTeams }
 * 400 { error, details: string[] }
 */

import { NextResponse } from 'next/server';
import { buildTeamChallengeStandings } from '@/lib/team-challenges/standings';
import { getTeamChallengeStore } from '@/lib/team-challenges/teamChallengeStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export function GET(request: Request): NextResponse {
  const rawLimit = new URL(request.url).searchParams.get('limit');
  const limit = rawLimit === null ? DEFAULT_LIMIT : Number(rawLimit);

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return NextResponse.json(
      {
        error: 'Invalid leaderboard query',
        details: [`limit must be an integer between 1 and ${MAX_LIMIT}`],
      },
      { status: 400 }
    );
  }

  const store = getTeamChallengeStore();
  const standings = buildTeamChallengeStandings(store.teams(), store.challenge());

  return NextResponse.json(
    {
      challengeId: standings.challenge.id,
      metric: standings.challenge.metric,
      generatedAt: standings.generatedAt,
      // Kept for API consumers that predate the standings snapshot.
      lastUpdated: standings.generatedAt,
      limit,
      totals: standings.totals,
      winner: standings.winner,
      entries: standings.rankings.slice(0, limit),
      totalTeams: standings.totals.teams,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
