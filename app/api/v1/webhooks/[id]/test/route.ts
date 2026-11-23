import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import { UUID_RE } from '@/lib/webhook/presenters';
import { getSubscriptionByPublicId } from '@/lib/webhook/repository';
import { sendTestPing, WebhookSubscriptionInputError } from '@/lib/webhook/subscriptionService';
import { authenticateWebhookV1Request } from '@/lib/webhook/v1Auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await authenticateWebhookV1Request(request, 'webhooks:write');
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { error: 'not_found', message: 'Webhook subscription not found.' },
      { status: 404, headers: auth.headers }
    );
  }

  let eventType: string | undefined;
  try {
    const body = (await request.json()) as { eventType?: string };
    if (typeof body?.eventType === 'string') {
      eventType = body.eventType.trim();
    }
  } catch {
    // Empty body is valid for test ping.
  }

  try {
    const pool = getPool();
    const row = await getSubscriptionByPublicId(pool, id, {
      apiKeyId: auth.caller.apiKeyId,
    });
    if (!row) {
      return NextResponse.json(
        { error: 'not_found', message: 'Webhook subscription not found.' },
        { status: 404, headers: auth.headers }
      );
    }

    const result = await sendTestPing(pool, row.id, eventType);
    return NextResponse.json(result, { status: 200, headers: auth.headers });
  } catch (error) {
    if (error instanceof WebhookSubscriptionInputError) {
      return NextResponse.json(
        { error: 'bad_request', message: error.message },
        { status: error.status, headers: auth.headers }
      );
    }
    console.error('[api/v1/webhooks/[id]/test] POST failed:', error);
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to dispatch test webhook.' },
      { status: 500, headers: auth.headers }
    );
  }
}
