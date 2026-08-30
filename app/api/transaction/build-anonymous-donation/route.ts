import { NextResponse } from 'next/server';
import { invokeVerifyProof } from '@/lib/stellar/zk-verifier-client';
import { buildDonationTransaction } from '@/lib/stellar/transaction';
import { calculateDonationAllocation } from '@/lib/constants/donation';
import { deserialiseProof, deserialiseInputs } from '@/lib/zk/proof-generator';
import type { AnonymousDonationRequest, AnonymousDonationResponse } from '@/lib/zk/types';
import { withWalletLock } from '@/lib/cache/redlock';
import logger from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: AnonymousDonationRequest;

  try {
    body = (await request.json()) as AnonymousDonationRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { proof: rawProof, inputs: rawInputs, amount, network, idempotencyKey, regionId } = body;

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

    logger.error('[api:anon-donation] ZK verifier error', { err });
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

    // Serialize builds for fee-payer wallet to prevent nonce collisions
    // This is critical for custodial fee-payer account used for anonymous donations
    const { transactionXdr, networkPassphrase } = await withWalletLock(
      feePayerPublicKey,
      () => {
        logger.info('[api:anon-donation] Building anon donation tx with wallet lock', {
          feePayerPublicKey,
          amount,
          regionId,
        });
        return buildDonationTransaction(
          amount,
          feePayerPublicKey,
          network,
          idempotencyKey,
          1,
          'USDC',
          undefined,
          regionId
        );
      },
      { ttlMs: 15_000, retryCount: 15, retryDelayMs: 100 }
    );

    const allocation = calculateDonationAllocation(amount);

    const response: AnonymousDonationResponse = {
      transactionXdr,
      networkPassphrase,
      allocation,
    };

    return NextResponse.json(response);
  } catch (err) {
    logger.error('[api:anon-donation] Error building anonymous donation transaction', { err });
    const msg = err instanceof Error ? err.message : 'Failed to build transaction';
    const status = msg.includes('acquire lock') ? 409 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
