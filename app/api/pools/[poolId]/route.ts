/**
 * GET   /api/pools/:poolId  — get pool details
 * PATCH /api/pools/:poolId  — join pool / add contribution
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getPool, joinPool } from '@/lib/services/pooled-sponsorship';
import type { JoinPoolRequest } from '@/lib/types/pooled-sponsorship';

export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ poolId: string }> }
) {
  try {
    const { poolId } = await params;
    const pool = getPool(poolId);
    if (!pool) {
      return NextResponse.json({ error: 'Pool not found' }, { status: 404 });
    }
    return NextResponse.json(pool);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get pool';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ poolId: string }> }
) {
  try {
    const { poolId } = await params;
    const body = (await request.json()) as Omit<JoinPoolRequest, 'poolId'>;
    const { sponsorAddress, contributionUsdc, sponsorName } = body;

    if (!sponsorAddress) {
      return NextResponse.json({ error: 'sponsorAddress is required' }, { status: 400 });
    }
    if (!contributionUsdc || contributionUsdc <= 0) {
      return NextResponse.json(
        { error: 'contributionUsdc must be greater than zero' },
        { status: 400 }
      );
    }

    const pool = joinPool({ poolId, sponsorAddress, contributionUsdc, sponsorName });
    return NextResponse.json(pool);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to join pool';
    const status = message.includes('not found') ? 404 : message.includes('not open') ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
