import { type NextRequest, NextResponse } from 'next/server';

import { HABITAT_SCORE_METHOD } from '@/lib/wildlife/habitat';
import { getWildlifeHabitatSnapshot, seedProjectWildlife } from '@/lib/wildlife/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/wildlife/habitat?projectId=proj-001
 *
 * Habitat quality score, recent approved sightings and featured wildlife
 * photos for a project (issue #1665).
 */
export function GET(request: NextRequest): NextResponse {
  const projectId = request.nextUrl.searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'projectId query parameter is required' }, { status: 400 });
  }

  seedProjectWildlife(projectId);
  const snapshot = getWildlifeHabitatSnapshot(projectId);

  return NextResponse.json({ ...snapshot, method: HABITAT_SCORE_METHOD });
}
