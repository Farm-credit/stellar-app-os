import { type NextRequest, NextResponse } from 'next/server';

import {
  WildlifeSubmissionError,
  reviewSighting,
  type ReviewDecision,
} from '@/lib/wildlife/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Context {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/wildlife/sightings/[id]/review
 *
 * Approve or reject a pending sighting (issue #1665).
 * Body: `{ "decision": "approve" | "reject", "reviewer": "Name" }`
 */
export async function POST(request: NextRequest, context: Context): Promise<NextResponse> {
  const { id } = await context.params;

  let body: { decision?: unknown; reviewer?: unknown } | null = null;
  try {
    body = (await request.json()) as { decision?: unknown; reviewer?: unknown } | null;
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }

  const decision = body?.decision;
  if (decision !== 'approve' && decision !== 'reject') {
    return NextResponse.json({ error: 'decision must be "approve" or "reject"' }, { status: 400 });
  }
  const reviewer = typeof body?.reviewer === 'string' ? body.reviewer : '';

  try {
    const sighting = reviewSighting(id, decision as ReviewDecision, reviewer);
    if (!sighting) {
      return NextResponse.json({ error: 'Sighting not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, sighting });
  } catch (error) {
    if (error instanceof WildlifeSubmissionError) {
      return NextResponse.json({ error: error.message, field: error.field }, { status: 409 });
    }
    throw error;
  }
}
