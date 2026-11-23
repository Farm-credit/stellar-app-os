import { NextResponse } from 'next/server';
import { getVerifiedFieldCreditDetails } from '@/lib/stellar/carbon-credits-client';
import type { NetworkType } from '@/lib/types/wallet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const digest = url.searchParams.get('digest') ?? '';
  const network =
    url.searchParams.get('network') ?? process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet';
  if (!/^[a-f0-9]{64}$/.test(digest)) {
    return NextResponse.json(
      { error: 'A lowercase 64-character evidence digest is required.' },
      { status: 400 }
    );
  }
  if (network !== 'testnet' && network !== 'mainnet') {
    return NextResponse.json({ error: 'network must be testnet or mainnet.' }, { status: 400 });
  }

  try {
    const credit = await getVerifiedFieldCreditDetails(digest, network as NetworkType);
    return NextResponse.json({ network, credit }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[api:field-credits:issuance] On-chain evidence lookup failed', error);
    const isMissingRecord = error instanceof Error && /Error\(Contract, #28\)/.test(error.message);
    return NextResponse.json(
      {
        error: isMissingRecord
          ? 'No field issuance was found for this digest on the configured contract.'
          : 'Unable to query the configured Soroban contract. Check network and deployment settings.',
      },
      { status: isMissingRecord ? 404 : 503 }
    );
  }
}
