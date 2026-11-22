/**
 * Field team photo submissions — Issue #1640.
 *
 * POST /api/field/tree-updates  (multipart/form-data)
 *   fields: clientId, treeId, latitude, longitude, capturedAt, photo,
 *           accuracyMeters?, healthScore?, note?
 *   Requires `Authorization: Bearer <FIELD_TEAM_API_TOKEN>`. Re-sending the same
 *   clientId is idempotent, which makes offline sync retries safe.
 *
 * GET /api/field/tree-updates?treeId=...  — public list of updates for a tree.
 */
import { timingSafeEqual } from 'node:crypto';
import { type NextRequest, NextResponse } from 'next/server';
import {
  FieldSubmissionError,
  listSubmissionsForTree,
  recordSubmission,
} from '@/lib/field/submissions';
import { TreeHealthError } from '@/lib/api/tree-health';

export const runtime = 'nodejs';

function tokenMatches(header: string | null, expected: string): boolean {
  const supplied = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

function optionalNumber(form: FormData, key: string): number | null {
  const raw = text(form, key).trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : Number.NaN;
}

export async function POST(request: NextRequest) {
  const expectedToken = process.env.FIELD_TEAM_API_TOKEN?.trim();
  if (!expectedToken) {
    return NextResponse.json(
      { success: false, error: 'Field submissions are not configured' },
      { status: 503 }
    );
  }
  if (!tokenMatches(request.headers.get('authorization'), expectedToken)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid form data' }, { status: 400 });
  }

  const photo = form.get('photo');
  if (!(photo instanceof File)) {
    return NextResponse.json({ success: false, error: 'Photo is required' }, { status: 400 });
  }

  try {
    const { submission, duplicate } = await recordSubmission({
      clientId: text(form, 'clientId'),
      treeId: text(form, 'treeId'),
      latitude: Number(text(form, 'latitude')),
      longitude: Number(text(form, 'longitude')),
      accuracyMeters: optionalNumber(form, 'accuracyMeters'),
      capturedAt: text(form, 'capturedAt'),
      healthScore: optionalNumber(form, 'healthScore'),
      note: text(form, 'note').trim().slice(0, 500) || null,
      photo: { bytes: new Uint8Array(await photo.arrayBuffer()), contentType: photo.type },
    });
    return NextResponse.json(
      { success: true, duplicate, submission },
      { status: duplicate ? 200 : 201 }
    );
  } catch (error) {
    if (error instanceof FieldSubmissionError || error instanceof TreeHealthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('[api/field/tree-updates] error:', error);
    return NextResponse.json({ success: false, error: 'Unexpected error' }, { status: 500 });
  }
}

export function GET(request: NextRequest) {
  const treeId = request.nextUrl.searchParams.get('treeId')?.trim();
  if (!treeId) {
    return NextResponse.json({ success: false, error: 'treeId is required' }, { status: 400 });
  }
  return NextResponse.json({ success: true, updates: listSubmissionsForTree(treeId) });
}
