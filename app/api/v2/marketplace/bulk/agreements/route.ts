import { NextResponse } from 'next/server';
import {
  createBulkPurchaseAgreement,
  listBulkPurchaseAgreements,
  BULK_MIN_TONS,
} from '@/lib/marketplace/bulkPurchasing';
import logger from '@/lib/logger';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const buyerAddress = searchParams.get('buyer') || undefined;
    const farmerAddress = searchParams.get('farmer') || undefined;
    const status = searchParams.get('status') || undefined;
    const projectId = searchParams.get('projectId') || undefined;

    const agreements = listBulkPurchaseAgreements({
      buyerAddress,
      farmerAddress,
      status,
      projectId,
    });

    return NextResponse.json({
      count: agreements.length,
      agreements,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      buyer,
      farmer,
      projectId,
      projectName,
      committedTons,
      standardPricePerTon,
      negotiatedPricePerTon,
      terms,
    } = body;

    if (!buyer?.walletAddress || !farmer?.walletAddress || !projectId || !projectName) {
      return NextResponse.json(
        {
          error:
            'Missing required parameters: buyer.walletAddress, farmer.walletAddress, projectId, and projectName are required.',
        },
        { status: 400 }
      );
    }

    const tons = Number(committedTons);
    if (!tons || tons < BULK_MIN_TONS) {
      return NextResponse.json(
        {
          error: `Corporate bulk purchasing requires a minimum batch commitment of ${BULK_MIN_TONS} metric tonnes. Received: ${tons}`,
        },
        { status: 400 }
      );
    }

    const basePrice = Number(standardPricePerTon);
    if (!basePrice || basePrice <= 0) {
      return NextResponse.json(
        { error: 'standardPricePerTon must be a positive number' },
        { status: 400 }
      );
    }

    const agreement = createBulkPurchaseAgreement({
      buyer,
      farmer,
      projectId,
      projectName,
      committedTons: tons,
      standardPricePerTon: basePrice,
      negotiatedPricePerTon: negotiatedPricePerTon ? Number(negotiatedPricePerTon) : undefined,
      terms,
    });

    logger.info('[api:v2:marketplace:bulk:agreements] Created bulk purchase agreement', {
      agreementId: agreement.id,
      buyer: agreement.buyer.organizationName,
      farmer: agreement.farmer.name,
      committedTons: agreement.committedTons,
      negotiatedPrice: agreement.negotiatedPricePerTon,
      totalUsd: agreement.totalValueUsd,
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Bulk purchase agreement successfully established with farmer.',
        agreement,
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error('[api:v2:marketplace:bulk:agreements] Failed to create agreement', { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 400 }
    );
  }
}
