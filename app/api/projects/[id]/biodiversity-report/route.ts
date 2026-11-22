import { type NextRequest, NextResponse } from 'next/server';

import { mockAdminProjectDetails } from '@/lib/api/mock/adminProjectDetails';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';
import {
  REPORT_METHODOLOGY,
  getAnnualReportCadence,
  getProjectBiodiversityReports,
  parseReportYear,
} from '@/lib/biodiversity/impact-report';
import { seedProjectWildlife } from '@/lib/wildlife/service';
import type { BiodiversityReportListResponse } from '@/lib/types/biodiversity-report';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Resolves a project by id or slug against the same mocks the project page uses. */
function resolveProjectId(idOrSlug: string): string | null {
  const adminProject = mockAdminProjectDetails.find(
    (project) => project.id === idOrSlug || project.slug === idOrSlug
  );
  const carbonProject = mockCarbonProjects.find(
    (project) => project.id === (adminProject?.id ?? idOrSlug)
  );
  return adminProject?.id ?? carbonProject?.id ?? null;
}

/**
 * GET /api/projects/[id]/biodiversity-report[?year=2025]
 *
 * Annual biodiversity impact reports for a reforestation project (issue #1630),
 * compiled from the field team's census submissions and wildlife sighting log.
 * With `?year=`, only that year's report is returned.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const projectId = resolveProjectId(id);
  if (!projectId) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  let requestedYear: number | undefined;
  const yearParam = new URL(request.url).searchParams.get('year');
  if (yearParam !== null) {
    const parsed = parseReportYear(yearParam);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.message, code: parsed.error }, { status: 400 });
    }
    requestedYear = parsed.value;
  }

  // Keep the demo wildlife baseline consistent with /api/wildlife/habitat.
  seedProjectWildlife(projectId);

  const allReports = getProjectBiodiversityReports(projectId);
  const reports =
    requestedYear === undefined
      ? allReports
      : allReports.filter((report) => report.year === requestedYear);

  if (requestedYear !== undefined && reports.length === 0) {
    return NextResponse.json(
      { error: `No field survey data for ${requestedYear}`, code: 'no_survey_data' },
      { status: 404 }
    );
  }

  const payload: BiodiversityReportListResponse = {
    projectId,
    cadence: getAnnualReportCadence(allReports),
    reports,
    methodology: [...REPORT_METHODOLOGY],
  };

  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
