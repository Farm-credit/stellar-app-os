import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import { toDeliveryDto, UUID_RE } from '@/lib/webhook/presenters';
import { getSubscriptionByPublicId, listDeliveries } from '@/lib/webhook/repository';
import { authenticateWebhookV1Request } from '@/lib/webhook/v1Auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await authenticateWebhookV1Request(request, 'webhooks:read');
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { error: 'not_found', message: 'Webhook subscription not found.' },
      { status: 404, headers: auth.headers }
    );
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

    const url = new URL(request.url);
    const status = url.searchParams.get('status') ?? undefined;
    const eventType = url.searchParams.get('eventType') ?? undefined;
    const limit = Number(url.searchParams.get('limit') ?? '50');
    const offset = Number(url.searchParams.get('offset') ?? '0');

    const deliveries = await listDeliveries(pool, {
      subscriptionId: row.id,
      apiKeyId: auth.caller.apiKeyId,
      status,
      eventType,
      limit: Number.isFinite(limit) ? limit : 50,
      offset: Number.isFinite(offset) ? offset : 0,
    });

    return NextResponse.json(
      {
        deliveries: deliveries.map(toDeliveryDto),
        total: deliveries.length,
      },
      { status: 200, headers: auth.headers }
    );
  } catch (error) {
    console.error('[api/v1/webhooks/[id]/deliveries] GET failed:', error);
    return NextResponse.json(
      { error: 'internal_error', message: 'Failed to fetch webhook deliveries.' },
      { status: 500, headers: auth.headers }
    );
  }
}
