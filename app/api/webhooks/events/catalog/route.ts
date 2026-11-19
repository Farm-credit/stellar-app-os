/**
 * /api/webhooks/events/catalog — Issue #1378
 *
 * Discovery endpoint for the v1 offset-verification webhooks. External systems
 * call this to learn which events exist, which payload fields are required, and
 * what a real payload looks like — so integrations can be generated instead of
 * transcribed from docs.
 *
 * The samples are produced by the same builders used in production, so the
 * catalog cannot drift from the wire format.
 *
 * GET /api/webhooks/events/catalog
 *   ?type=credit.verified   optional — return a single event descriptor
 *
 * Responses:
 *   200  { version, generatedAt, events: OffsetVerificationEventDescriptor[] }
 *   400  { error, details: string[] } — unknown `type`
 *   500  { error }
 *
 * Closes #1378
 */

import { NextResponse } from 'next/server';
import {
  OFFSET_VERIFICATION_EVENT_CATALOG,
  OFFSET_VERIFICATION_EVENT_TYPES,
  OFFSET_VERIFICATION_WEBHOOK_VERSION,
  isOffsetVerificationEventType,
} from '@/lib/webhook/offset-verification';

export const runtime = 'nodejs';

// The catalog only changes when the code is deployed, so it can be cached hard.
const CACHE_HEADERS: Record<string, string> = {
  'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
  'X-Webhook-Version': OFFSET_VERIFICATION_WEBHOOK_VERSION,
};

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const type = url.searchParams.get('type');

    if (type !== null && type !== '' && !isOffsetVerificationEventType(type)) {
      return NextResponse.json(
        {
          error: 'Unknown webhook event type',
          details: [
            `type must be one of: ${OFFSET_VERIFICATION_EVENT_TYPES.join(', ')}`,
          ],
        },
        { status: 400, headers: CACHE_HEADERS }
      );
    }

    const events = type
      ? OFFSET_VERIFICATION_EVENT_CATALOG.filter((event) => event.type === type)
      : OFFSET_VERIFICATION_EVENT_CATALOG;

    return NextResponse.json(
      {
        version: OFFSET_VERIFICATION_WEBHOOK_VERSION,
        generatedAt: new Date().toISOString(),
        events,
      },
      { headers: CACHE_HEADERS }
    );
  } catch (error) {
    console.error('[api/webhooks/events/catalog] error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500, headers: CACHE_HEADERS }
    );
  }
}
