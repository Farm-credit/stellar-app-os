/**
 * API Route: Submit Anonymous Donation
 *
 * Handles submission of privacy-preserving donations with ZK proofs.
 * Verifies the proof and submits the transaction to the Stellar network.
 */

import { NextResponse } from 'next/server';
import { checkSubmitAnonRateLimit } from '@/lib/rateLimit';
import { submitTransaction } from '@/lib/stellar/transaction';
import { verifyAnonymousDonationProof } from '@/lib/zk/prover';
import { isNullifierUsed } from '@/lib/stellar/anonymous-donation';
import type { AnonymousDonationProof } from '@/lib/zk/types';
import type { NetworkType } from '@/lib/types/wallet';

function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.headers.get('x-real-ip') ??
    '127.0.0.1'
  );
}

interface SubmitAnonymousRequest {
  transactionXdr: string;
  network: NetworkType;
  proof: AnonymousDonationProof;
  nullifier: string;
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const rateLimit = checkSubmitAnonRateLimit(ip);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many anonymous submissions. Please try again later.' },
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(rateLimit.retryAfter ?? 3600),
            'X-RateLimit-Limit': '5',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(rateLimit.reset / 1000)),
          },
        }
      );
    }

    const body = (await request.json()) as SubmitAnonymousRequest;
    const { transactionXdr, network, proof, nullifier } = body;

    // Validate required parameters
    if (!transactionXdr || !network || !proof || !nullifier) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // Step 1: Verify the ZK proof
    console.info('Verifying zero-knowledge proof...');
    const isProofValid = await verifyAnonymousDonationProof(proof);

    if (!isProofValid) {
      return NextResponse.json({ error: 'Invalid zero-knowledge proof' }, { status: 400 });
    }

    // Step 2: Check if nullifier has been used (prevent double-donations)
    console.info('Checking nullifier...');
    const nullifierExists = await isNullifierUsed(nullifier, network);

    if (nullifierExists) {
      return NextResponse.json(
        { error: 'Nullifier already used - this donation has already been submitted' },
        { status: 400 }
      );
    }

    // Step 3: Verify proof matches the provided nullifier
    if (proof.nullifier !== nullifier) {
      return NextResponse.json({ error: 'Proof nullifier mismatch' }, { status: 400 });
    }

    // Step 4: Submit the transaction to Stellar network
    console.info('Submitting anonymous transaction to Stellar...');
    const transactionHash = await submitTransaction(transactionXdr, network);

    // Step 5: Log the nullifier (in production, store in database)
    console.info('Anonymous donation submitted:', {
      transactionHash,
      nullifier: nullifier.slice(0, 16) + '...',
      timestamp: proof.timestamp,
    });

    // In production, you would:
    // 1. Store the nullifier in a database to prevent reuse
    // 2. Register the nullifier on-chain via smart contract
    // 3. Log the donation for analytics (without revealing donor identity)

    return NextResponse.json({
      success: true,
      transactionHash,
      message: 'Anonymous donation submitted successfully',
    });
  } catch (error) {
    console.error('Error submitting anonymous donation:', error);

    const errorMessage =
      error instanceof Error ? error.message : 'Failed to submit anonymous donation';

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

/**
 * GET endpoint to check if a nullifier has been used
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const nullifier = searchParams.get('nullifier');
    const network = searchParams.get('network') as NetworkType;

    if (!nullifier || !network) {
      return NextResponse.json(
        { error: 'Missing nullifier or network parameter' },
        { status: 400 }
      );
    }

    const isUsed = await isNullifierUsed(nullifier, network);

    return NextResponse.json({
      nullifier: nullifier.slice(0, 16) + '...',
      isUsed,
      network,
    });
  } catch (error) {
    console.error('Error checking nullifier:', error);

    return NextResponse.json({ error: 'Failed to check nullifier' }, { status: 500 });
  }
}
