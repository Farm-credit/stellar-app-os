// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * POST /api/challenges/contributions — Issue #1361
 *
 * Credits carbon offset (and optionally trees) to an employee team so its
 * offset-per-employee ratio — and therefore its standing — updates immediately.
 *
 * Body: { teamId: string; offsetTonnes: number; trees?: number }
 *
 * 201 { team, standing, generatedAt }
 * 400 { error } — invalid JSON body or missing/invalid fields
 * 404 { error } — unknown team
 */

import { NextResponse } from 'next/server';
import { buildTeamChallengeStandings } from '@/lib/team-challenges/standings';
import { getTeamChallengeStore } from '@/lib/team-challenges/teamChallengeStore';

export const runtime = 'nodejs';

interface ContributionBody {
  teamId?: unknown;
  offsetTonnes?: unknown;
  trees?: unknown;
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: ContributionBody;
  try {
    body = (await request.json()) as ContributionBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { teamId, offsetTonnes, trees } = body;

  if (typeof teamId !== 'string' || teamId.trim() === '') {
    return NextResponse.json({ error: 'teamId is required' }, { status: 400 });
  }
  if (typeof offsetTonnes !== 'number' || !Number.isFinite(offsetTonnes) || offsetTonnes <= 0) {
    return NextResponse.json({ error: 'offsetTonnes must be a positive number' }, { status: 400 });
  }
  if (trees !== undefined && (!Number.isInteger(trees) || trees < 0)) {
    return NextResponse.json({ error: 'trees must be a non-negative integer' }, { status: 400 });
  }

  const store = getTeamChallengeStore();
  if (!store.teams().some((team) => team.teamId === teamId)) {
    return NextResponse.json({ error: `Unknown team: ${teamId}` }, { status: 404 });
  }

  const team = store.recordOffset(teamId, {
    offsetTonnes,
    trees: typeof trees === 'number' ? trees : undefined,
  });

  const standings = buildTeamChallengeStandings(store.teams(), store.challenge());
  const standing = standings.rankings.find((entry) => entry.teamId === team.teamId) ?? null;

  return NextResponse.json({ team, standing, generatedAt: standings.generatedAt }, { status: 201 });
}
