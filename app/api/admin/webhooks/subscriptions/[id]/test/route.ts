import { NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth/admin';
import { getPool } from '@/lib/db/client';
import { UUID_RE } from '@/lib/webhook/presenters';
import { getSubscriptionById, getSubscriptionByPublicId } from '@/lib/webhook/repository';
import { sendTestPing, WebhookSubscriptionInputError } from '@/lib/webhook/subscriptionService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let eventType: string | undefined;
  try {
    const body = (await request.json()) as { eventType?: string };
    if (typeof body?.eventType === 'string') {
      eventType = body.eventType.trim();
    }
  } catch {
    // Empty body is valid.
  }

  const { id } = await context.params;
  const pool = getPool();

  try {
    const row = UUID_RE.test(id)
      ? await getSubscriptionByPublicId(pool, id)
      : Number.isInteger(Number(id)) && Number(id) > 0
        ? await getSubscriptionById(pool, Number(id))
        : null;

    if (!row) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }

    const result = await sendTestPing(pool, row.id, eventType);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof WebhookSubscriptionInputError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[api/admin/webhooks/subscriptions/[id]/test] POST failed:', error);
    return NextResponse.json({ error: 'Failed to send test ping' }, { status: 500 });
  }
}
