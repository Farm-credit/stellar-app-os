import { NextResponse } from 'next/server';
import {
  calculateBulkPricing,
  BULK_MIN_TONS,
  getBulkPurchaseAgreementById,
} from '@/lib/marketplace/bulkPurchasing';
import { buildBulkPurchaseTransaction } from '@/lib/stellar/transaction';
import logger from '@/lib/logger';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      buyerPublicKey,
      projectId,
      quantityTons,
      basePricePerTon = 40,
      negotiatedPricePerTon,
      agreementId,
      network = 'testnet',
    } = body;

    if (!buyerPublicKey || !projectId) {
      return NextResponse.json(
        { error: 'buyerPublicKey and projectId are required.' },
        { status: 400 }
      );
    }

    const tons = Number(quantityTons);
    if (!tons || tons < BULK_MIN_TONS) {
      return NextResponse.json(
        {
          error: `Corporate bulk purchasing requires a minimum batch size of ${BULK_MIN_TONS} metric tonnes. Received: ${tons}`,
        },
        { status: 400 }
      );
    }

    let finalNegotiatedPrice = negotiatedPricePerTon ? Number(negotiatedPricePerTon) : undefined;

    if (agreementId) {
      const agreement = getBulkPurchaseAgreementById(agreementId);
      if (agreement) {
        finalNegotiatedPrice = agreement.negotiatedPricePerTon;
      }
    }

    const pricing = calculateBulkPricing(tons, Number(basePricePerTon), finalNegotiatedPrice);

    logger.info('[api:v2:marketplace:bulk:purchase] Building bulk purchase order', {
      buyerPublicKey,
      projectId,
      tons,
      effectivePricePerTon: pricing.effectivePricePerTon,
      totalUsd: pricing.bulkTotalUsd,
      savingsUsd: pricing.savingsUsd,
      tier: pricing.tierName,
    });

    const txResult = await buildBulkPurchaseTransaction({
      projectId,
      quantity: tons,
      totalPrice: pricing.bulkTotalUsd,
      buyerPublicKey,
      network: network === 'mainnet' ? 'mainnet' : 'testnet',
      metadata: {
        companyName: 'Corporate Bulk Offsets',
        initiativeDescription: `Bulk purchase of ${tons}t at ${pricing.appliedDiscountPercentage}% volume discount`,
        storageType: 'on-chain',
      },
    });

    return NextResponse.json({
      success: true,
      pricing,
      transaction: txResult,
    });
  } catch (error) {
    logger.error('[api:v2:marketplace:bulk:purchase] Failed to build bulk transaction', { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}
