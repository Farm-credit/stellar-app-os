/**
 * Sponsor push subscriptions — Issue #1698.
 *
 * POST   /api/push/subscriptions  { sponsorId, subscription }  save
 * DELETE /api/push/subscriptions  { sponsorId, endpoint }      remove
 */
import { type NextRequest, NextResponse } from 'next/server';
import {
  PushSubscriptionError,
  removeSubscription,
  saveSubscription,
} from '@/lib/api/push-subscriptions';
import { readJsonBody } from '@/lib/api/field-messaging-http';

export const runtime = 'nodejs';

async function handle(request: NextRequest, action: (b: Record<string, unknown>) => void) {
  const body = await readJsonBody<Record<string, unknown>>(request);
  if (!body) {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }
  try {
    action(body);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof PushSubscriptionError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('[api/push/subscriptions] error:', error);
    return NextResponse.json({ success: false, error: 'Unexpected error' }, { status: 500 });
  }
}

export function POST(request: NextRequest) {
  return handle(request, (b) => saveSubscription(b.sponsorId, b.subscription));
}

export function DELETE(request: NextRequest) {
  return handle(request, (b) => removeSubscription(b.sponsorId, b.endpoint));
}
