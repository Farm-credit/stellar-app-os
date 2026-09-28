import { NextResponse } from 'next/server';
import {
  calculateBulkPricing,
  VOLUME_DISCOUNT_TIERS,
  BULK_MIN_TONS,
} from '@/lib/marketplace/bulkPurchasing';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tons = parseFloat(searchParams.get('tons') || '100');
    const pricePerTon = parseFloat(searchParams.get('pricePerTon') || '40');
    const negotiatedRateParam = searchParams.get('negotiatedRate');
    const negotiatedRate = negotiatedRateParam ? parseFloat(negotiatedRateParam) : undefined;

    const calculation = calculateBulkPricing(tons, pricePerTon, negotiatedRate);

    return NextResponse.json({
      minimumBulkBatchTons: BULK_MIN_TONS,
      availableTiers: VOLUME_DISCOUNT_TIERS,
      calculation,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to calculate bulk discount' },
      { status: 500 }
    );
  }
}
