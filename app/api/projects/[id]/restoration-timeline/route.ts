/**
 * GET /api/projects/:id/restoration-timeline
 *
 * Returns the project's planned and completed restoration phases (land
 * preparation, nursery, planting, maintenance, monitoring) with derived
 * statuses for the Gantt-style timeline, and the sponsor subscription list
 * used for phase completion announcements. (#1678)
 *
 * Responses:
 *   200  { projectId, phases: [{ ...phase, status }], span }
 *   404  { error: "Project not found" }
 */

import { type NextRequest, NextResponse } from 'next/server';
import { mockAdminProjectDetails } from '@/lib/api/mock/adminProjectDetails';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';
import {
  derivePhaseStatus,
  getRestorationPhasesForProject,
  getTimelineSpan,
} from '@/lib/restorationTimelines';

export const runtime = 'nodejs';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const adminProject = mockAdminProjectDetails.find(
    (project) => project.id === id || project.slug === id
  );
  const carbonProject = mockCarbonProjects.find(
    (project) => project.id === (adminProject?.id ?? id)
  );
  const projectId = adminProject?.id ?? carbonProject?.id;

  if (!projectId) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const phases = getRestorationPhasesForProject(projectId);

  return NextResponse.json(
    {
      projectId,
      phases: phases.map((phase) => ({ ...phase, status: derivePhaseStatus(phase) })),
      span: getTimelineSpan(phases),
    },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' } }
  );
}
