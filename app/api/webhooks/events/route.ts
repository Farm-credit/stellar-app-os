import { type NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth/admin';
import { getPool } from '@/lib/db/client';
import { toDeliveryDto } from '@/lib/webhook/presenters';
import { listDeliveries } from '@/lib/webhook/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') ?? undefined;
    const eventType = searchParams.get('eventType') ?? undefined;
    const parsedLimit = parseInt(searchParams.get('limit') || '100', 10);
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : 100;

    const rows = await listDeliveries(getPool(), { status, eventType, limit });
    const events = rows.map(toDeliveryDto);

    return NextResponse.json(
      {
        events,
        total: events.length,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Webhook events fetch error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch webhook events',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
