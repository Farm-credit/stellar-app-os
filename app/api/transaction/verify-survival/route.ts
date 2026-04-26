import { NextResponse } from 'next/server';
import { invokeSurvivalVerification } from '@/lib/stellar/survival-verifier-client';
import type { SurvivalVerificationRequest, SurvivalVerificationResponse } from '@/lib/types/survival';

export async function POST(request: Request) {
  let body: SurvivalVerificationRequest;

  try {
    body = (await request.json()) as SurvivalVerificationRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { farmerPublicKey, survivalRate, proofHash, contractType, network } = body;

  // ── Validate ──────────────────────────────────────────────────────────────

  if (!farmerPublicKey) {
    return NextResponse.json({ error: 'Missing farmerPublicKey' }, { status: 400 });
  }
  if (typeof survivalRate !== 'number' || survivalRate < 0 || survivalRate > 100) {
    return NextResponse.json(
      { error: 'survivalRate must be a number between 0 and 100' },
      { status: 400 }
    );
  }
  if (!proofHash || proofHash.length !== 64 || !/^[0-9a-f]+$/i.test(proofHash)) {
    return NextResponse.json(
      { error: 'proofHash must be a 64-char lowercase hex string (SHA-256)' },
      { status: 400 }
    );
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

  // ── Invoke on-chain survival verification ─────────────────────────────────

  let txHash: string;

  try {
    txHash = await invokeSurvivalVerification(
      farmerPublicKey,
      proofHash,
      survivalRate,
      contractType,
      network
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Contract invocation failed';

    if (msg.includes('planting not yet verified') || msg.includes('first milestone not yet verified')) {
      return NextResponse.json({ error: 'PLANTING_NOT_VERIFIED' }, { status: 409 });
    }
    if (msg.includes('6-month survival period not yet elapsed')) {
      return NextResponse.json({ error: 'SURVIVAL_PERIOD_NOT_ELAPSED' }, { status: 409 });
    }
    if (msg.includes('no escrow')) {
      return NextResponse.json({ error: 'ESCROW_NOT_FOUND' }, { status: 404 });
    }

    console.error('Survival verification error:', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // ── Determine outcome from survival rate ──────────────────────────────────
  //
  // The contract emits either a "survived" or "disputed" event.
  // We derive the outcome here from the same threshold (>= 70%) so the
  // response is immediately useful without a second RPC read.

  const MIN_SURVIVAL_RATE = 70;
  const outcome = survivalRate >= MIN_SURVIVAL_RATE ? 'completed' : 'disputed';

  const response: SurvivalVerificationResponse = {
    outcome,
    // Amount released is only meaningful on completion — return '0' for disputed
    amountReleased: outcome === 'completed' ? 'tranche2' : '0',
    survivalRate,
    transactionHash: txHash,
  };

  return NextResponse.json(response, { status: outcome === 'completed' ? 200 : 202 });
}
