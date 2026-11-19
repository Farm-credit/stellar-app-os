/**
 * GET /api/projects/:id/planting-methods
 *
 * Returns the documented tree-planting methods for a project — descriptions,
 * field steps, media (photos/videos) and links to the scientific rationale
 * for each chosen approach.
 *
 * Path params:
 *   id — project id (`proj-001`) or admin project slug
 *        (`amazon-rainforest-reforestation`)
 *
 * Responses:
 *   200  { projectId, methods, hasData }
 *   404  { error: "Project not found" }
 *
 * Closes #1675
 */

import { type NextRequest, NextResponse } from 'next/server';
import { mockAdminProjectDetails } from '@/lib/api/mock/adminProjectDetails';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';
import { getPlantingMethodsForProject } from '@/lib/plantingMethods';

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

  const methods = getPlantingMethodsForProject(projectId);

  return NextResponse.json(
    { projectId, hasData: methods.length > 0, methods },
    {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30' },
    }
  );
}
