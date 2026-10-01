// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * GET /api/challenges — Issue #1361
 *
 * Lists the corporate offset challenges available to compete in. Today the
 * platform runs a single active sprint sourced from the team-challenge store;
 * when challenges move into the database this handler returns the same shape
 * with more rows.
 *
 * 200 { challenges: TeamChallengeWindow[], total, generatedAt }
 */

import { NextResponse } from 'next/server';
import { getTeamChallengeStore } from '@/lib/team-challenges/teamChallengeStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(): NextResponse {
  const challenge = getTeamChallengeStore().challenge();

  return NextResponse.json(
    {
      challenges: [challenge],
      total: 1,
      generatedAt: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
