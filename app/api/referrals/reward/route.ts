import { type NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import {
  isValidStellarAddress,
  queuePlanterReferralReward,
  queueReferralReward,
} from '@/lib/referrals';

export const runtime = 'nodejs';

/**
 * POST /api/referrals/reward
 *
 * This endpoint is called by trusted tree- or job-completion workflows.
 * - For referred sponsors: queues a 1 XLM reward on first completed tree.
 * - For referred planters: queues a 2 XLM reward on first completed job.
 *
 * It queues, but does not pay, the reward; a treasury worker can safely process
 * queued rows later.
 */
export async function POST(request: NextRequest) {
  let body: {
    referredWallet?: string;
    treeRef?: string;
    jobRef?: string;
    role?: 'sponsor' | 'planter';
    referralType?: 'sponsor' | 'planter';
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const referredWallet = body.referredWallet?.trim() ?? '';
  const treeRef = body.treeRef?.trim() ?? '';
  const jobRef = body.jobRef?.trim() ?? '';
  const ref = jobRef || treeRef;
  const isPlanter =
    body.role === 'planter' || body.referralType === 'planter' || Boolean(jobRef);

  if (!isValidStellarAddress(referredWallet) || !ref) {
    return NextResponse.json(
      { error: 'referredWallet and treeRef or jobRef are required' },
      { status: 400 }
    );
  }

  try {
    const result = isPlanter
      ? await queuePlanterReferralReward(getPool(), referredWallet, ref)
      : await queueReferralReward(getPool(), referredWallet, ref);
    const status = result.status === 'not_eligible' ? 409 : 200;
    return NextResponse.json(result, { status });
  } catch (error) {
    console.error('[api/referrals/reward] error:', error);
    return NextResponse.json({ error: 'Unable to queue referral reward' }, { status: 500 });
  }
}
