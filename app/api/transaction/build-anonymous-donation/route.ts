import { NextResponse } from 'next/server';
import { invokeVerifyProof } from '@/lib/stellar/zk-verifier-client';
import { buildDonationTransaction } from '@/lib/stellar/transaction';
import { calculateDonationAllocation } from '@/lib/constants/donation';
import { deserialiseProof, deserialiseInputs } from '@/lib/zk/proof-generator';
import type { AnonymousDonationRequest, AnonymousDonationResponse } from '@/lib/zk/types';

export async function POST(request: Request) {
  let body: AnonymousDonationRequest;

  try {
    body = (await request.json()) as AnonymousDonationRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { proof: rawProof, inputs: rawInputs, amount, network, idempotencyKey } = body;

  // ── Validate required fields ──────────────────────────────────────────────

  if (!rawProof || !rawInputs) {
    return NextResponse.json({ error: 'Missing proof or inputs' }, { status: 400 });
  }
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'Invalid donation amount' }, { status: 400 });
  }
  if (network !== 'testnet' && network !== 'mainnet') {
    return NextResponse.json({ error: 'UNSUPPORTED_NETWORK' }, { status: 400 });
  }
  if (!idempotencyKey) {
    return NextResponse.json({ error: 'Missing idempotencyKey' }, { status: 400 });
  }

  // ── Deserialise and validate proof shape ──────────────────────────────────

  let proof: ReturnType<typeof deserialiseProof>;
  let inputs: ReturnType<typeof deserialiseInputs>;

  try {
    proof = deserialiseProof(rawProof);
    inputs = deserialiseInputs(rawInputs);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Malformed proof or inputs';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // ── On-chain ZK proof verification (no donor wallet address involved) ─────

  try {
    await invokeVerifyProof(proof, inputs, network);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Verification failed';

    if (msg === 'INVALID_PROOF') {
      return NextResponse.json({ error: 'INVALID_PROOF' }, { status: 422 });
    }
    if (msg === 'NULLIFIER_ALREADY_SPENT') {
      return NextResponse.json({ error: 'NULLIFIER_ALREADY_SPENT' }, { status: 409 });
    }

    console.error('ZK verifier error:', err);
    return NextResponse.json({ error: 'Proof verification failed' }, { status: 500 });
  }

  // ── Build the 70/30 USDC donation transaction ─────────────────────────────
  //
  // The transaction is built using the platform's fee-payer account as the
  // source.  The donor's wallet address is NOT included — they sign a
  // separate payment operation client-side if needed, or the platform
  // sponsors the transaction entirely for anonymous donations.

  try {
    const feePayerPublicKey = process.env.STELLAR_FEE_PAYER_PUBLIC_KEY;
    if (!feePayerPublicKey) {
      throw new Error('STELLAR_FEE_PAYER_PUBLIC_KEY environment variable is not set');
    }

    const { transactionXdr, networkPassphrase } = await buildDonationTransaction(
      amount,
      feePayerPublicKey,
      network,
      idempotencyKey
    );

    const allocation = calculateDonationAllocation(amount);

    const response: AnonymousDonationResponse = {
      transactionXdr,
      networkPassphrase,
      allocation,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error('Error building anonymous donation transaction:', err);
    const msg = err instanceof Error ? err.message : 'Failed to build transaction';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
