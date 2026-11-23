/**
 * GET /api/v2/projects/{id}/soil-health — Issue #1664
 *
 * Returns a project's soil health measurement series and the baseline-to-latest
 * comparison the project page renders as a radar chart plus a change table.
 *
 * The series is served with its provenance (`source`, `isSampleData`) so the UI
 * can label illustrative values instead of presenting them as verified field
 * measurements.
 *
 * Responses
 * ---------
 *   200  ProjectSoilHealthReport
 *   404  { error, code: 'not_found' }   — no soil measurements for this project
 *   500  { error }
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { apiVersionHeaders } from '@/lib/api/versioning';
import { getMockProjectSoilHealthData } from '@/lib/api/mock/projectSoilHealth';
import { buildProjectSoilHealthReport } from '@/lib/services/project-soil-health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

function responseHeaders(): Record<string, string> {
  return {
    // Project-level impact data is public, but measurements are appended over
    // time: cache briefly rather than for the lifetime of the build.
    'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
    ...(apiVersionHeaders('v2') as Record<string, string>),
  };
}

export async function GET(_request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { id } = await context.params;
  const projectId = id?.trim();

  if (!projectId) {
    return NextResponse.json(
      { error: 'A project id is required.', code: 'invalid_project' },
      { status: 400, headers: responseHeaders() }
    );
  }

  try {
    const data = getMockProjectSoilHealthData(projectId);

    if (!data) {
      return NextResponse.json(
        { error: 'No soil health measurements are available for this project.', code: 'not_found' },
        { status: 404, headers: responseHeaders() }
      );
    }

    return NextResponse.json(buildProjectSoilHealthReport(projectId, data), {
      headers: responseHeaders(),
    });
  } catch (error) {
    console.error('[api/v2/projects/[id]/soil-health] error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: responseHeaders() }
    );
  }
}
