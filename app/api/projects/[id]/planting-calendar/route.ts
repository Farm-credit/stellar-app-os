/**
 * GET /api/projects/:id/planting-calendar
 *
 * Public iCal (.ics) download of a project's upcoming planting events.
 *
 * Path params:
 *   id — project id (`proj-001`) or admin project slug
 *
 * Responses:
 *   200  text/calendar attachment
 *   404  { error: "Project not found" }
 *
 * Closes #1659
 */

import { type NextRequest, NextResponse } from 'next/server';
import { mockAdminProjectDetails } from '@/lib/api/mock/adminProjectDetails';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';
import { buildPlantingCalendarIcs, getUpcomingPlantingEvents } from '@/lib/plantingSchedule';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const adminProject = mockAdminProjectDetails.find(
    (project) => project.id === id || project.slug === id
  );
  const carbonProject = mockCarbonProjects.find((project) => project.id === (adminProject?.id ?? id));
  const projectId = adminProject?.id ?? carbonProject?.id;

  if (!projectId) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const ics = buildPlantingCalendarIcs(projectId, getUpcomingPlantingEvents(projectId));

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="planting-schedule-${projectId}.ics"`,
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=60',
    },
  });
}
