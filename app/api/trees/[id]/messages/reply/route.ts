/**
 * Field team reply to a sponsor — Issue #1686.
 *
 * POST /api/trees/:id/messages/reply  { sponsorId, body, language? }
 * Requires `Authorization: Bearer <FIELD_TEAM_API_TOKEN>`.
 */
import { timingSafeEqual } from 'node:crypto';
import { type NextRequest, NextResponse } from 'next/server';
import { sendFieldTeamReply } from '@/lib/api/field-messaging';
import { fieldMessagingErrorResponse, readJsonBody } from '@/lib/api/field-messaging-http';

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
      { success: false, error: 'Field team replies are not configured' },
      { status: 503 }
    );
  }
  if (!tokenMatches(request.headers.get('authorization'), expectedToken)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await readJsonBody<{ sponsorId?: string; body?: string; language?: string }>(
      request
    );
    if (!body) {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }
    const thread = await sendFieldTeamReply({
      treeId: id,
      sponsorId: body.sponsorId ?? '',
      body: body.body,
      language: body.language,
    });
    return NextResponse.json({ success: true, thread }, { status: 201 });
  } catch (error) {
    return fieldMessagingErrorResponse(error);
  }
}
