import { NextResponse } from 'next/server';
import { buildDonationTransaction, MAX_BATCH_TREES } from '@/lib/stellar/transaction';
import { calculateDonationAllocation } from '@/lib/constants/donation';
import type { BuildDonationTransactionRequest } from '@/lib/types/donation-payment';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BuildDonationTransactionRequest;
    const { amount, walletPublicKey, network, idempotencyKey, treeCount = 1 } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid donation amount' }, { status: 400 });
    }

    if (!walletPublicKey || !network || !idempotencyKey) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    if (treeCount < 1 || treeCount > MAX_BATCH_TREES) {
      return NextResponse.json(
        { error: `Tree count must be between 1 and ${MAX_BATCH_TREES}` },
        { status: 400 }
      );
    }

    const result = await buildDonationTransaction(
      amount,
      walletPublicKey,
      network,
      idempotencyKey,
      treeCount
    );

    const perTreeAllocation = calculateDonationAllocation(amount);
    const allocation = {
      perTree: perTreeAllocation,
      total: {
        total: parseFloat((perTreeAllocation.total * treeCount).toFixed(7)),
        planting: parseFloat((perTreeAllocation.planting * treeCount).toFixed(7)),
        buffer: parseFloat((perTreeAllocation.buffer * treeCount).toFixed(7)),
      },
      treeCount,
    };

    return NextResponse.json({ ...result, allocation });
  } catch (error) {
    console.error('Error building donation transaction:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to build transaction';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
