/**
 * GET /api/projects/:id/events
 *
 * Lists tree-planting events for a project so the event page can embed the
 * live stream, shows which batch sponsors were invited, and exposes saved
 * recordings linked to the affected tree profiles.
 *
 * Path params:
 *   id — project id (`proj-001`) or admin project slug
 *
 * Responses:
 *   200  { projectId, events: [{ ...event, invitees, recordingLinks }] }
 *   404  { error: "Project not found" }
 *
 * Closes #1708
 */

import { type NextRequest, NextResponse } from 'next/server';
import { mockAdminProjectDetails } from '@/lib/api/mock/adminProjectDetails';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';
import {
  getPlantingEventsForProject,
  linkRecordingToTrees,
  getSponsorsToInvite,
} from '@/lib/treePlantingStreams';

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

  const events = getPlantingEventsForProject(projectId).map((event) => ({
    ...event,
    invitees: getSponsorsToInvite(event).map((sponsor) => ({
      sponsorId: sponsor.sponsorId,
      name: sponsor.sponsorName,
      treeIds: sponsor.treeIds,
    })),
    recordingLinks: linkRecordingToTrees(event),
  }));

  return NextResponse.json(
    { projectId, events },
    {
      headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=10' },
    }
  );
}
