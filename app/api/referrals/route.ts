import { type NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import {
  getReferralStats,
  isValidStellarAddress,
  registerReferral,
  type ReferralType,
} from '@/lib/referrals';

export const runtime = 'nodejs';

/** GET /api/referrals?wallet=G...&role=planter|sponsor */
export async function GET(request: NextRequest) {
  const url = request.nextUrl ?? new URL(request.url);
  const wallet = url.searchParams.get('wallet')?.trim() ?? '';
  const roleParam = url.searchParams.get('role')?.trim();
  const role: ReferralType | undefined =
    roleParam === 'planter' ? 'planter' : roleParam === 'sponsor' ? 'sponsor' : undefined;

  if (!isValidStellarAddress(wallet)) {
    return NextResponse.json({ error: 'A valid Stellar wallet is required' }, { status: 400 });
  }

  try {
    const stats = await getReferralStats(getPool(), wallet, undefined, role);
    return NextResponse.json(stats, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error('[api/referrals] stats error:', error);
    return NextResponse.json({ error: 'Unable to load referral statistics' }, { status: 500 });
  }
}

/** POST /api/referrals — associate a referred user (planter or sponsor) with a referral code. */
export async function POST(request: NextRequest) {
  let body: {
    code?: string;
    referredWallet?: string;
    role?: 'sponsor' | 'planter';
    referralType?: 'sponsor' | 'planter';
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const code = body.code?.trim() ?? '';
  const referredWallet = body.referredWallet?.trim() ?? '';
  const role: ReferralType =
    body.role === 'planter' || body.referralType === 'planter' ? 'planter' : 'sponsor';

  if (!code || !isValidStellarAddress(referredWallet)) {
    return NextResponse.json(
      { error: 'code and a valid referredWallet are required' },
      { status: 400 }
    );
  }

  try {
    await registerReferral(getPool(), code, referredWallet, role);
    return NextResponse.json({ registered: true, role }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to register referral';
    const status = message === 'Invalid referral code' ? 400 : 404;
    return NextResponse.json({ error: message }, { status });
  }
}
