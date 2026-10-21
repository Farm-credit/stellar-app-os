/**
 * Field team health reading for a tree — Issue #1698.
 *
 * POST /api/trees/:id/health  { score, cause?, remediation?, note? }
 * Requires `Authorization: Bearer <FIELD_TEAM_API_TOKEN>`. A score drop of more
 * than 20 points caused by pest damage or drought stress alerts the sponsor.
 */
import { timingSafeEqual } from 'node:crypto';
import { type NextRequest, NextResponse } from 'next/server';
import { TreeHealthError, recordHealthObservation } from '@/lib/api/tree-health';
import { readJsonBody } from '@/lib/api/field-messaging-http';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

function tokenMatches(header: string | null, expected: string): boolean {
  const supplied = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const expectedToken = process.env.FIELD_TEAM_API_TOKEN?.trim();
  if (!expectedToken) {
    return NextResponse.json(
      { success: false, error: 'Health reporting is not configured' },
      { status: 503 }
    );
  }
  if (!tokenMatches(request.headers.get('authorization'), expectedToken)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const body = await readJsonBody<Record<string, unknown>>(request);
  if (!body) {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const { id } = await params;
    const result = await recordHealthObservation({ ...body, treeId: id });
    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (error) {
    if (error instanceof TreeHealthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('[api/trees/:id/health] error:', error);
    return NextResponse.json({ success: false, error: 'Unexpected error' }, { status: 500 });
  }
}
