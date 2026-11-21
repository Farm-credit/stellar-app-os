import { NextResponse } from 'next/server';
import {
  buildBatchedCarbonCreditPurchase,
  listBatchExecutions,
  type BatchPurchaseItem,
} from '@/lib/marketplace/transactionBatcher';
import logger from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { purchases, sponsorPublicKey, network = 'testnet' } = body;

    if (!Array.isArray(purchases) || purchases.length === 0) {
      return NextResponse.json(
        { error: 'purchases must be a non-empty array of purchase requests.' },
        { status: 400 }
      );
    }

    // Validate purchase items
    for (let i = 0; i < purchases.length; i++) {
      const p = purchases[i];
      if (!p.buyerPublicKey || !p.sellerPublicKey || !p.amount || !p.priceUsdc) {
        return NextResponse.json(
          {
            error: `Purchase at index ${i} is missing required fields (buyerPublicKey, sellerPublicKey, amount, priceUsdc).`,
          },
          { status: 400 }
        );
      }
    }

    const batchResult = await buildBatchedCarbonCreditPurchase(
      purchases as BatchPurchaseItem[],
      sponsorPublicKey,
      network === 'mainnet' ? 'mainnet' : 'testnet'
    );

    logger.info('[api:v2:marketplace:batch-purchase] Processed purchase batch', {
      batchId: batchResult.batchId,
      itemCount: batchResult.manifest.itemCount,
      savingsPercentage: batchResult.feeComparison.savingsPercentage,
    });

    return NextResponse.json(
      {
        success: true,
        message: `Successfully batched ${batchResult.manifest.itemCount} purchases into a single blockchain transaction, saving ${batchResult.feeComparison.savingsPercentage}% in gas fees.`,
        batchResult,
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error('[api:v2:marketplace:batch-purchase] Batch creation failed', { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const history = listBatchExecutions();
    return NextResponse.json({
      count: history.length,
      batches: history,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
