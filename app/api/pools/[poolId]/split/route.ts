/**
 * GET /api/pools/:poolId/split
 *
 * Returns the proportional carbon-credit split for all sponsors in a pool.
 * Uses the pool's target USDC as the credit count (1 TREE per USDC contributed).
 *
 * Query params:
 *   totalCredits  — override total credits to distribute (optional, defaults to pool.targetUsdc)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getPool, computeCreditSplit } from '@/lib/services/pooled-sponsorship';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ poolId: string }> }
) {
  try {
    const { poolId } = await params;
    const pool = getPool(poolId);
    if (!pool) {
      return NextResponse.json({ error: 'Pool not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const overrideCredits = searchParams.get('totalCredits');
    const totalCredits = overrideCredits
      ? parseFloat(overrideCredits)
      : pool.targetUsdc;

    if (isNaN(totalCredits) || totalCredits <= 0) {
      return NextResponse.json({ error: 'totalCredits must be a positive number' }, { status: 400 });
    }

    const split = computeCreditSplit(pool, totalCredits);
    return NextResponse.json(split);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to compute split';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
