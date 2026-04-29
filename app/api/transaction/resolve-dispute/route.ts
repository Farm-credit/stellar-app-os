import { NextResponse } from 'next/server';
import { invokeResolveDispute } from '@/lib/stellar/survival-verifier-client';
import type { DisputeResolutionRequest, DisputeResolutionResponse } from '@/lib/types/survival';

export async function POST(request: Request) {
  let body: DisputeResolutionRequest;

  try {
    body = (await request.json()) as DisputeResolutionRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { farmerPublicKey, releaseToFarmer, contractType, network } = body;

  if (!farmerPublicKey) {
    return NextResponse.json({ error: 'Missing farmerPublicKey' }, { status: 400 });
  }
  if (typeof releaseToFarmer !== 'boolean') {
    return NextResponse.json({ error: 'releaseToFarmer must be a boolean' }, { status: 400 });
  }
  if (contractType !== 'tree-escrow' && contractType !== 'escrow-milestone') {
    return NextResponse.json(
      { error: 'contractType must be "tree-escrow" or "escrow-milestone"' },
      { status: 400 }
    );
  }
  if (network !== 'testnet' && network !== 'mainnet') {
    return NextResponse.json({ error: 'UNSUPPORTED_NETWORK' }, { status: 400 });
  }

  let txHash: string;

  try {
    txHash = await invokeResolveDispute(farmerPublicKey, releaseToFarmer, contractType, network);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Contract invocation failed';

    if (msg.includes('not in Disputed state')) {
      return NextResponse.json({ error: 'ESCROW_NOT_DISPUTED' }, { status: 409 });
    }
    if (msg.includes('no escrow')) {
      return NextResponse.json({ error: 'ESCROW_NOT_FOUND' }, { status: 404 });
    }

    console.error('Dispute resolution error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const response: DisputeResolutionResponse = {
    transactionHash: txHash,
    amountReleased: 'tranche2',
    releasedTo: releaseToFarmer ? 'farmer' : 'donor',
  };

  return NextResponse.json(response);
}
