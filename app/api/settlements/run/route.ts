import { NextResponse } from 'next/server';
import {
  listSettlements,
  processDueSettlements,
  recordMarketplacePurchase,
} from '@/lib/settlement/settlement-service';

function isAuthorized(request: Request): boolean {
  const expected = process.env.SETTLEMENT_WORKER_TOKEN;
  return !expected || request.headers.get('authorization') === `Bearer ${expected}`;
}

export function GET() {
  return NextResponse.json({ settlements: listSettlements() });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body.action === 'process_due') {
      if (!isAuthorized(request))
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      const asOf = body.asOf ? new Date(body.asOf) : new Date();
      if (Number.isNaN(asOf.getTime()))
        return NextResponse.json({ error: 'Invalid asOf timestamp' }, { status: 400 });
      return NextResponse.json({ settlements: await processDueSettlements(asOf) });
    }
    return NextResponse.json(recordMarketplacePurchase(body), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to process settlement' },
      { status: 400 }
    );
  }
}
