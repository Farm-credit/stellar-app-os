import { NextResponse } from 'next/server';
import {
  emitAdminProjectTransitionWebhooks,
  getAdminProjectById,
  isValidAdminLifecycleStatus,
  updateAdminProject,
} from '@/lib/admin/projectsRepository';
import { isAdminRequest } from '@/lib/auth/admin';
import { getPool } from '@/lib/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  try {
    const project = await getAdminProjectById(getPool(), id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    return NextResponse.json({ project });
  } catch (error) {
    console.error('[api/admin/projects/[id]] GET failed:', error);
    return NextResponse.json({ error: 'Failed to load project' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;

  let body: {
    lifecycleStatus?: unknown;
    pricePerTonUsd?: unknown;
    verificationEnabled?: unknown;
    verificationNotes?: unknown;
    note?: unknown;
    reason?: unknown;
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

  if (body.lifecycleStatus !== undefined && !isValidAdminLifecycleStatus(body.lifecycleStatus)) {
    return NextResponse.json({ error: 'Invalid lifecycleStatus' }, { status: 400 });
  }

  let pricePerTonUsd: number | undefined;
  if (body.pricePerTonUsd !== undefined) {
    pricePerTonUsd = Number(body.pricePerTonUsd);
    if (!Number.isFinite(pricePerTonUsd) || pricePerTonUsd <= 0) {
      return NextResponse.json(
        { error: 'pricePerTonUsd must be a positive number' },
        { status: 400 }
      );
    }
  }

  if (body.verificationEnabled !== undefined && typeof body.verificationEnabled !== 'boolean') {
    return NextResponse.json({ error: 'verificationEnabled must be a boolean' }, { status: 400 });
  }

  const updatedBy =
    typeof body.updatedBy === 'string' && body.updatedBy.trim() ? body.updatedBy.trim() : 'admin';

  try {
    const result = await updateAdminProject(getPool(), id, {
      lifecycleStatus: body.lifecycleStatus,
      pricePerTonUsd,
      verificationEnabled: body.verificationEnabled,
      verificationNotes:
        typeof body.verificationNotes === 'string' ? body.verificationNotes : undefined,
      updatedBy,
    });

    if (!result) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    emitAdminProjectTransitionWebhooks(result.previous, result.updated, {
      note:
        typeof body.note === 'string'
          ? body.note
          : typeof body.verificationNotes === 'string'
            ? body.verificationNotes
            : null,
      approvedBy: updatedBy,
      approvalReference:
        typeof body.approvalReference === 'string' ? body.approvalReference : undefined,
      transactionHash: typeof body.transactionHash === 'string' ? body.transactionHash : null,
      explorerUrl: typeof body.explorerUrl === 'string' ? body.explorerUrl : null,
      reason: typeof body.reason === 'string' ? body.reason : null,
    });

    return NextResponse.json({
      project: result.updated,
      previousStatus: result.previous.lifecycleStatus,
      previousPricePerTonUsd: result.previous.pricePerTonUsd,
    });
  } catch (error) {
    console.error('[api/admin/projects/[id]] PATCH failed:', error);
    return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
  }
}
