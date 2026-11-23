import { type NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth/admin';
import { getPool } from '@/lib/db/client';
import { toDeliveryDto, UUID_RE } from '@/lib/webhook/presenters';
import { listDeliveries } from '@/lib/webhook/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const params = request.nextUrl.searchParams;
    const status = params.get('status') ?? undefined;
    const eventType = params.get('eventType') ?? undefined;
    const rawSubId = params.get('subscriptionId') ?? undefined;
    const parsedLimit = parseInt(params.get('limit') || '100', 10);
    const parsedOffset = parseInt(params.get('offset') || '0', 10);

    const subscriptionPublicId = rawSubId && UUID_RE.test(rawSubId) ? rawSubId : undefined;
    const subscriptionId =
      rawSubId && !subscriptionPublicId && Number.isInteger(Number(rawSubId))
        ? Number(rawSubId)
        : undefined;

    const rows = await listDeliveries(getPool(), {
      subscriptionId,
      subscriptionPublicId,
      status,
      eventType,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : 100,
      offset: Number.isFinite(parsedOffset) ? parsedOffset : 0,
    });

    const deliveries = rows.map(toDeliveryDto);
    return NextResponse.json({
      deliveries,
      total: deliveries.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[api/admin/webhooks/deliveries] GET failed:', error);
    return NextResponse.json({ error: 'Failed to load webhook deliveries' }, { status: 500 });
  }
}
