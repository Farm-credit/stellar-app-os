import { type NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import { isValidStellarAddress, queueReferralReward } from '@/lib/referrals';

export const runtime = 'nodejs';

/**
 * POST /api/referrals/reward
 *
 * This endpoint is called by the trusted tree-completion workflow after a
 * referred sponsor's first tree is completed. It queues, but does not pay, the
 * reward; a treasury worker can safely process queued rows later.
 */
export async function POST(request: NextRequest) {
  let body: { referredWallet?: string; treeRef?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const referredWallet = body.referredWallet?.trim() ?? '';
  const treeRef = body.treeRef?.trim() ?? '';
  if (!isValidStellarAddress(referredWallet) || !treeRef) {
    return NextResponse.json({ error: 'referredWallet and treeRef are required' }, { status: 400 });
  }

  try {
    const result = await queueReferralReward(getPool(), referredWallet, treeRef);
    const status = result.status === 'not_eligible' ? 409 : 200;
    return NextResponse.json(result, { status });
  } catch (error) {
    console.error('[api/referrals/reward] error:', error);
    return NextResponse.json({ error: 'Unable to queue referral reward' }, { status: 500 });
  }
}
