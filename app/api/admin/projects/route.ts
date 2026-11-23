import { NextResponse } from 'next/server';
import {
  emitAdminProjectTransitionWebhooks,
  isValidAdminLifecycleStatus,
  listAdminProjects,
  updateAdminProject,
  type AdminProjectRecord,
} from '@/lib/admin/projectsRepository';
import { isAdminRequest } from '@/lib/auth/admin';
import { getPool } from '@/lib/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const projects = await listAdminProjects(getPool());
    return NextResponse.json({ projects });
  } catch (error) {
    console.error('[api/admin/projects] GET failed:', error);
    return NextResponse.json({ error: 'Failed to load admin projects' }, { status: 500 });
  }
}

export async function PATCH(request: Request): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    projectIds?: unknown;
    lifecycleStatus?: unknown;
    verificationEnabled?: unknown;
    note?: unknown;
    updatedBy?: unknown;
    approvalReference?: unknown;
    transactionHash?: unknown;
    explorerUrl?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!Array.isArray(body.projectIds) || body.projectIds.length === 0) {
    return NextResponse.json({ error: 'projectIds must be a non-empty array' }, { status: 400 });
  }

  const projectIds = body.projectIds
    .filter((id): id is string => typeof id === 'string' && id.trim() !== '')
    .map((id) => id.trim());

  if (projectIds.length === 0) {
    return NextResponse.json(
      { error: 'projectIds must contain valid project IDs' },
      { status: 400 }
    );
  }

  if (body.lifecycleStatus !== undefined && !isValidAdminLifecycleStatus(body.lifecycleStatus)) {
    return NextResponse.json({ error: 'Invalid lifecycleStatus' }, { status: 400 });
  }

  if (body.verificationEnabled !== undefined && typeof body.verificationEnabled !== 'boolean') {
    return NextResponse.json({ error: 'verificationEnabled must be a boolean' }, { status: 400 });
  }

  const pool = getPool();
  const updatedProjects: AdminProjectRecord[] = [];
  const updatedBy =
    typeof body.updatedBy === 'string' && body.updatedBy.trim() ? body.updatedBy.trim() : 'admin';

  try {
    for (const id of projectIds) {
      const result = await updateAdminProject(pool, id, {
        lifecycleStatus: body.lifecycleStatus,
        verificationEnabled: body.verificationEnabled,
        updatedBy,
      });
      if (!result) continue;

      emitAdminProjectTransitionWebhooks(result.previous, result.updated, {
        note: typeof body.note === 'string' ? body.note : null,
        approvedBy: updatedBy,
        approvalReference:
          typeof body.approvalReference === 'string' ? body.approvalReference : undefined,
        transactionHash: typeof body.transactionHash === 'string' ? body.transactionHash : null,
        explorerUrl: typeof body.explorerUrl === 'string' ? body.explorerUrl : null,
      });
      updatedProjects.push(result.updated);
    }

    return NextResponse.json({
      projects: updatedProjects,
      updatedCount: updatedProjects.length,
    });
  } catch (error) {
    console.error('[api/admin/projects] PATCH failed:', error);
    return NextResponse.json({ error: 'Failed to update projects' }, { status: 500 });
  }
}
