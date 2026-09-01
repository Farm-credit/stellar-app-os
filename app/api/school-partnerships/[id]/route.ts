import { type NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import {
  contributeToBatch,
  createBatch,
  enrollStudents,
  getSchoolPartnershipDetail,
} from '@/lib/services/school-partnership';
import type {
  ContributeToBatchInput,
  CreateBatchInput,
  EnrollStudentsInput,
} from '@/lib/types/school-partnership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/school-partnerships/[id]
 *
 * Get full details for a school partnership, including members and batches.
 */
export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = await params;
  const partnershipId = Number.parseInt(id, 10);

  if (!Number.isFinite(partnershipId) || partnershipId <= 0) {
    return NextResponse.json({ error: 'Invalid partnership ID' }, { status: 400 });
  }

  try {
    const detail = await getSchoolPartnershipDetail(getPool(), partnershipId);
    if (!detail) {
      return NextResponse.json({ error: 'Partnership not found' }, { status: 404 });
    }
    return NextResponse.json(detail, {
      headers: { 'Cache-Control': 'private, s-maxage=60, stale-while-revalidate=120' },
    });
  } catch (error) {
    console.error('[school-partnership detail] GET error', error);
    return NextResponse.json({ error: 'Failed to fetch partnership details' }, { status: 500 });
  }
}

/**
 * PATCH /api/school-partnerships/[id]
 *
 * Actions (via x-action header or query param):
 *   enroll      — Enroll students into the partnership
 *   batch       — Create a new sponsorship batch
 *   contribute  — Contribute trees to an existing batch
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const partnershipId = Number.parseInt(id, 10);

  if (!Number.isFinite(partnershipId) || partnershipId <= 0) {
    return NextResponse.json({ error: 'Invalid partnership ID' }, { status: 400 });
  }

  const action = request.nextUrl.searchParams.get('action') ?? request.headers.get('x-action');

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    switch (action) {
      case 'enroll': {
        const input: EnrollStudentsInput = {
          partnership_id: partnershipId,
          students: Array.isArray(body.students)
            ? (body.students as EnrollStudentsInput['students'])
            : [],
        };

        if (input.students.length === 0) {
          return NextResponse.json({ error: 'At least one student is required' }, { status: 400 });
        }

        const result = await enrollStudents(getPool(), input);
        return NextResponse.json(result, { status: 200 });
      }

      case 'batch': {
        const input: CreateBatchInput = {
          partnership_id: partnershipId,
          project_name: String(body.project_name ?? '').trim(),
          description: body.description ? String(body.description) : undefined,
          target_trees: typeof body.target_trees === 'number' ? body.target_trees : undefined,
          created_by: String(body.created_by ?? '').trim(),
        };

        if (!input.project_name) {
          return NextResponse.json({ error: 'project_name is required' }, { status: 400 });
        }
        if (!input.created_by) {
          return NextResponse.json({ error: 'created_by (wallet) is required' }, { status: 400 });
        }

        const result = await createBatch(getPool(), input);
        return NextResponse.json(result, { status: 201 });
      }

      case 'contribute': {
        const input: ContributeToBatchInput = {
          batch_id: typeof body.batch_id === 'number' ? body.batch_id : Number(body.batch_id),
          wallet: String(body.wallet ?? '').trim(),
          member_id: body.member_id ? Number(body.member_id) : undefined,
          trees_funded:
            typeof body.trees_funded === 'number' ? body.trees_funded : Number(body.trees_funded),
          xlm_amount:
            typeof body.xlm_amount === 'number' ? body.xlm_amount : Number(body.xlm_amount),
          tx_hash: body.tx_hash ? String(body.tx_hash) : undefined,
        };

        if (!input.wallet || !input.batch_id || !input.trees_funded || !input.xlm_amount) {
          return NextResponse.json(
            { error: 'batch_id, wallet, trees_funded, and xlm_amount are required' },
            { status: 400 }
          );
        }

        const result = await contributeToBatch(getPool(), input);
        return NextResponse.json(result, { status: 200 });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}. Use 'enroll', 'batch', or 'contribute'.` },
          { status: 400 }
        );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Operation failed';
    console.error('[school-partnership detail] PATCH error', error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
