import { NextResponse } from 'next/server';
import { recordReferralAttribution } from '@/lib/referrals';

interface ReferralAttributionRequest {
  planterId: string;
  sponsorId: string;
  transactionHash: string;
}

export async function POST(request: Request) {
  let body: ReferralAttributionRequest;
  try {
    body = (await request.json()) as ReferralAttributionRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const attribution = recordReferralAttribution(
    body.planterId,
    body.sponsorId,
    body.transactionHash
  );
  if (!attribution) {
    return NextResponse.json(
      { error: 'Referral is invalid or the sponsor has already used a referral.' },
      { status: 409 }
    );
  }

  return NextResponse.json({ ...attribution, status: 'bonus_pending' }, { status: 201 });
}
