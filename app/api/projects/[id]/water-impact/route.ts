import { type NextRequest, NextResponse } from 'next/server';
import { mockAdminProjectDetails } from '@/lib/api/mock/adminProjectDetails';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';
import { getMockWaterImpactAssessments } from '@/lib/api/mock/waterImpactAssessments';
import { normalizeWaterImpactAssessments } from '@/lib/water/water-impact';
import type { WaterImpactResponse } from '@/lib/types/water-impact';

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

  const assessments = normalizeWaterImpactAssessments(getMockWaterImpactAssessments(projectId));
  const payload: WaterImpactResponse = {
    projectId,
    projectName: adminProject?.name ?? carbonProject?.name ?? projectId,
    assessments,
    hasData: assessments.length > 0,
  };

  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' },
  });
}
