import { type NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';
import { getReferralStats, isValidStellarAddress, registerReferral } from '@/lib/referrals';

export const runtime = 'nodejs';

/** GET /api/referrals?wallet=G... */
export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get('wallet')?.trim() ?? '';
  if (!isValidStellarAddress(wallet)) {
    return NextResponse.json({ error: 'A valid Stellar wallet is required' }, { status: 400 });
  }

  try {
    const stats = await getReferralStats(getPool(), wallet);
    return NextResponse.json(stats, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error('[api/referrals] stats error:', error);
    return NextResponse.json({ error: 'Unable to load referral statistics' }, { status: 500 });
  }
}

/** POST /api/referrals — associate a referred sponsor with a referral code. */
export async function POST(request: NextRequest) {
  let body: { code?: string; referredWallet?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const code = body.code?.trim() ?? '';
  const referredWallet = body.referredWallet?.trim() ?? '';
  if (!code || !isValidStellarAddress(referredWallet)) {
    return NextResponse.json(
      { error: 'code and a valid referredWallet are required' },
      { status: 400 }
    );
  }

  try {
    await registerReferral(getPool(), code, referredWallet);
    return NextResponse.json({ registered: true }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to register referral';
    const status = message === 'Invalid referral code' ? 400 : 404;
    return NextResponse.json({ error: message }, { status });
  }
}
