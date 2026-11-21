/**
 * Sponsor ↔ field team messages for one tree — Issue #1686.
 *
 * GET  /api/trees/:id/messages?sponsorId=...&lang=en
 *   Returns the sponsor's thread, translated into `lang`, with the reply SLA.
 * POST /api/trees/:id/messages  { sponsorId, body, language }
 *   Sends a message to the field team responsible for the tree.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { getSponsorThread, sendSponsorMessage } from '@/lib/api/field-messaging';
import { fieldMessagingErrorResponse, readJsonBody } from '@/lib/api/field-messaging-http';

export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const thread = await getSponsorThread(
      id,
      searchParams.get('sponsorId') ?? '',
      searchParams.get('lang') ?? 'en'
    );
    return NextResponse.json(
      { success: true, thread },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return fieldMessagingErrorResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await readJsonBody<{ sponsorId?: string; body?: string; language?: string }>(
      request
    );
    if (!body) {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }
    const thread = await sendSponsorMessage({
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
