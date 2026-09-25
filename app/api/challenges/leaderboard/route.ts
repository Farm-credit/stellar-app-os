// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Team Challenges Leaderboard API
 * Issue #1423: Corporate offset goals - team challenges
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * GET /api/challenges/leaderboard
 * Get leaderboard for a challenge
 * Query: ?challengeId=xxx&metric=offset_per_employee&limit=10
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const challengeId = searchParams.get('challengeId');
  const metric = searchParams.get('metric') || 'offset_per_employee';
  const limit = parseInt(searchParams.get('limit') || '10', 10);

  if (!challengeId) {
    return NextResponse.json({ error: 'challengeId is required' }, { status: 400 });
  }

  // In production, compute from teamChallenges service
  return NextResponse.json({
    challengeId,
    metric,
    entries: [],
    totalTeams: 0,
    lastUpdated: new Date().toISOString(),
    limit,
  });
}
