import { NextResponse } from 'next/server';
import type { OpenDisputeRequest } from '@/lib/types/dispute';

/** POST /api/disputes/open — sponsor opens a verification dispute (#469). */
export async function POST(request: Request) {
  let body: OpenDisputeRequest;

  try {
    body = (await request.json()) as OpenDisputeRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { treeId, sponsorPublicKey, evidenceCid, network } = body;

  if (!treeId || treeId <= 0) {
    return NextResponse.json({ error: 'Invalid treeId' }, { status: 400 });
  }
  if (!sponsorPublicKey?.startsWith('G')) {
    return NextResponse.json({ error: 'Invalid sponsorPublicKey' }, { status: 400 });
  }
  if (!evidenceCid || evidenceCid.length !== 64) {
    return NextResponse.json(
      { error: 'evidenceCid must be a 32-byte hex hash (64 chars)' },
      { status: 400 }
    );
  }
  if (network !== 'testnet' && network !== 'mainnet') {
    return NextResponse.json({ error: 'UNSUPPORTED_NETWORK' }, { status: 400 });
  }

  // Contract invocation is handled by the fee-payer service when deployed.
  // Return accepted payload for integration testing until env is configured.
  return NextResponse.json({
    transactionHash: `mock-dispute-${treeId}-${Date.now()}`,
    treeId,
    status: 'dispute_opened',
    message: 'Fund release paused pending DAO arbitration vote',
  });
}
