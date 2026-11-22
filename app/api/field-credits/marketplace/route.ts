import { NextResponse } from 'next/server';
import { listVerifiedFieldRetailLots } from '@/lib/stellar/carbon-credits-client';
import type { NetworkType } from '@/lib/types/wallet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const configuredNetwork = process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet';
  const requestedNetwork = new URL(request.url).searchParams.get('network') ?? configuredNetwork;
  if (requestedNetwork !== 'testnet' && requestedNetwork !== 'mainnet') {
    return NextResponse.json({ error: 'network must be testnet or mainnet.' }, { status: 400 });
  }

  try {
    const lots = await listVerifiedFieldRetailLots(requestedNetwork as NetworkType, 25);
    return NextResponse.json(
      { network: requestedNetwork, lots },
      { headers: { 'Cache-Control': 'public, max-age=10, s-maxage=20, stale-while-revalidate=60' } }
    );
  } catch (error) {
    console.error('[api:field-credits:marketplace] On-chain listing read failed', error);
    return NextResponse.json(
      { error: 'Unable to load field-evidence-backed lots from the configured Soroban contract.' },
      { status: 503 }
    );
  }
}
