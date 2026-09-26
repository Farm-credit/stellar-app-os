import { NextResponse } from 'next/server';
import {
  contributeToCommunityOffsetPool,
  getCommunityOffsetPool,
  purchasePoolCredits,
} from '@/lib/services/community-offset-pools';
export async function GET(_request: Request, { params }: { params: Promise<{ poolId: string }> }) {
  const pool = getCommunityOffsetPool((await params).poolId);
  return pool
    ? NextResponse.json(pool)
    : NextResponse.json({ error: 'Pool not found' }, { status: 404 });
}
export async function PATCH(request: Request, { params }: { params: Promise<{ poolId: string }> }) {
  try {
    const body = await request.json();
    const poolId = (await params).poolId;
    if (body.action === 'purchase')
      return NextResponse.json(purchasePoolCredits(poolId, body.credits));
    return NextResponse.json(contributeToCommunityOffsetPool(poolId, body.wallet, body.amount));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to update pool' },
      { status: 400 }
    );
  }
}
