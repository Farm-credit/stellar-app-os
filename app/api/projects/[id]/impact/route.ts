/**
 * GET /api/projects/:id/impact
 *
 * Returns the aggregated project-level impact snapshot for a single offset
 * project: emissions reduced, jobs created, soil carbon sequestered, water
 * quality improved and biodiversity metrics. The five dimensions are the
 * contract for the project impact dashboard.
 *
 * Path params:
 *   id — project id (`proj-001`) or admin project slug
 *        (`amazon-rainforest-reforestation`)
 *
 * Responses:
 *   200  ProjectImpactResponse JSON
 *   404  { error: "Project not found" }
 *
 * Closes #1336
 */

import { type NextRequest, NextResponse } from 'next/server';
import { mockAdminProjectDetails } from '@/lib/api/mock/adminProjectDetails';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';
import { getMockProjectImpactRecords } from '@/lib/api/mock/projectImpactRecords';
import {
  buildProjectImpactSnapshotFromRecords,
  hasProjectImpactRecords,
  type ProjectImpactResponse,
} from '@/lib/impact/project-impact';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const records = getMockProjectImpactRecords(projectId);
  const refreshedAt = new Date().toISOString();

  const payload: ProjectImpactResponse = {
    projectId,
    projectName: adminProject?.name ?? carbonProject?.name ?? projectId,
    hasData: hasProjectImpactRecords(records, projectId),
    snapshot: buildProjectImpactSnapshotFromRecords(projectId, records, refreshedAt),
    refreshedAt,
  };

  return NextResponse.json(payload, {
    headers: {
      'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=10',
      'X-Cached-At': refreshedAt,
    },
  });
}
