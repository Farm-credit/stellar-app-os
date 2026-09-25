// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Team Challenges API
 * Issue #1423: Corporate offset goals - team challenges (v2) - API layer
 *
 * Provides REST API for team challenges management.
 * This enhances the existing lib/teamChallenges service with proper API routes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * GET /api/challenges
 * List challenges for a company
 * Query: ?companyId=xxx&status=active,upcoming&limit=20
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get('companyId') || session.user.companyId;
  const status = searchParams.get('status')?.split(',') || ['active', 'upcoming'];
  const limit = parseInt(searchParams.get('limit') || '20', 10);

  // In production, query from DB via teamChallenges service
  // For now, return mock structure to validate API contract
  return NextResponse.json({
    challenges: [],
    total: 0,
    companyId,
    status,
    limit,
    message: 'Challenges API ready - connect to teamChallenges service',
  });
}

/**
 * POST /api/challenges
 * Create a new challenge
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { name?: string; description?: string; startDate?: string; endDate?: string; metric?: string; prize?: string; teamIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.name?.trim() || !body.startDate || !body.endDate || !body.metric || !body.teamIds?.length) {
    return NextResponse.json(
      { error: 'name, startDate, endDate, metric and teamIds are required' },
      { status: 400 }
    );
  }

  if (body.teamIds.length < 2) {
    return NextResponse.json({ error: 'At least 2 teams required' }, { status: 400 });
  }

  const start = new Date(body.startDate);
  const end = new Date(body.endDate);
  if (start >= end) {
    return NextResponse.json({ error: 'startDate must be before endDate' }, { status: 400 });
  }

  // In production, delegate to teamChallenges service
  return NextResponse.json(
    {
      id: `challenge-${Date.now()}`,
      ...body,
      companyId: session.user.companyId,
      status: start <= new Date() ? 'active' : 'upcoming',
      createdAt: new Date().toISOString(),
    },
    { status: 201 }
  );
}
