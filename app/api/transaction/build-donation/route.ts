import { NextResponse } from 'next/server';
import { buildDonationTransaction } from '@/lib/stellar/transaction';
import type { BuildDonationTransactionRequest } from '@/lib/types/donation-payment';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BuildDonationTransactionRequest;
    const { amount, walletPublicKey, network, idempotencyKey } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid donation amount' }, { status: 400 });
    }

    if (!walletPublicKey || !network || !idempotencyKey) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const result = await buildDonationTransaction(amount, walletPublicKey, network, idempotencyKey);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error building donation transaction:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to build transaction';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
