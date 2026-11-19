import { type NextRequest, NextResponse } from 'next/server';

import {
  WildlifeSubmissionError,
  listSightings,
  seedProjectWildlife,
  submitSighting,
  type SightingFilter,
} from '@/lib/wildlife/service';
import type { SightingStatus, SubmitSightingInput } from '@/lib/wildlife/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/wildlife/sightings?projectId=proj-001&status=approved
 *
 * Wildlife sighting log (issue #1665). With `projectId`, the demo baseline
 * log is seeded on first read so the project page always has content.
 */
export function GET(request: NextRequest): NextResponse {
  const projectId = request.nextUrl.searchParams.get('projectId');
  const statusParam = request.nextUrl.searchParams.get('status');

  if (projectId) seedProjectWildlife(projectId);

  const filter: SightingFilter = {};
  if (projectId) filter.projectId = projectId;
  if (statusParam) {
    if (!['pending', 'approved', 'rejected'].includes(statusParam)) {
      return NextResponse.json(
        { error: 'status must be pending, approved or rejected' },
        { status: 400 }
      );
    }
    filter.status = statusParam as SightingStatus;
  }

  const sightings = listSightings(filter);
  return NextResponse.json({ sightings, count: sightings.length });
}

/**
 * POST /api/wildlife/sightings
 *
 * Submit a sighting (field teams and approved citizen scientists).
 * Field-team records are approved immediately; citizen-scientist records
 * enter the review queue (`requiresApproval: true`).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Partial<SubmitSightingInput> | null = null;
  try {
    body = (await request.json()) as Partial<SubmitSightingInput> | null;
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Request body is required' }, { status: 400 });
  }

  try {
    const result = submitSighting(body as SubmitSightingInput);
    return NextResponse.json(
      { success: true, sighting: result.sighting, requiresApproval: result.requiresApproval },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof WildlifeSubmissionError) {
      return NextResponse.json({ error: error.message, field: error.field }, { status: 400 });
    }
    throw error;
  }
}
