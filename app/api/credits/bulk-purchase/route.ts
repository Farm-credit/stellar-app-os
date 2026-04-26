import { NextResponse } from 'next/server';
import { buildBulkPurchaseTransaction } from '@/lib/stellar/transaction';
import { BULK_PURCHASE_MIN_QUANTITY } from '@/lib/types/carbon';
import type { BulkPurchaseOrder } from '@/lib/types/carbon';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BulkPurchaseOrder;
    const { projectId, quantity, totalPrice, buyerPublicKey, network, metadata } = body;

    if (!projectId || !buyerPublicKey || !network) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (quantity < BULK_PURCHASE_MIN_QUANTITY) {
      return NextResponse.json(
        { error: `Minimum quantity for bulk purchase is ${BULK_PURCHASE_MIN_QUANTITY}` },
        { status: 400 }
      );
    }

    if (totalPrice <= 0) {
      return NextResponse.json({ error: 'Total price must be greater than zero' }, { status: 400 });
    }

    if (network !== 'testnet' && network !== 'mainnet') {
      return NextResponse.json({ error: 'Invalid network' }, { status: 400 });
    }

    const result = await buildBulkPurchaseTransaction({
      projectId,
      quantity,
      totalPrice,
      buyerPublicKey,
      network,
      metadata,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Bulk purchase transaction build failed:', error);
    const message = error instanceof Error ? error.message : 'Failed to build transaction';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
