import { NextResponse } from 'next/server';
import { buildBulkPurchaseTransaction } from '@/lib/stellar/transaction';
import { BULK_PURCHASE_MIN_QUANTITY } from '@/lib/types/carbon';
import type { BulkPurchaseOrder } from '@/lib/types/carbon';
import { withWalletLock } from '@/lib/cache/redlock';
import logger from '@/lib/logger';

export const runtime = 'nodejs';

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

    const result = await withWalletLock(
      buyerPublicKey,
      async () => {
        logger.info('[api:bulk-purchase] Building bulk purchase tx with wallet lock', {
          buyerPublicKey,
          projectId,
          quantity,
        });
        return buildBulkPurchaseTransaction({
          projectId,
          quantity,
          totalPrice,
          buyerPublicKey,
          network,
          metadata,
        });
      },
      { ttlMs: 15_000, retryCount: 15 }
    );

    return NextResponse.json(result);
  } catch (error) {
    logger.error('[api:bulk-purchase] Bulk purchase transaction build failed', { error });
    const message = error instanceof Error ? error.message : 'Failed to build transaction';
    const status = message.includes('acquire lock') ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
