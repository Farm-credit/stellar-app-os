import { NextRequest, NextResponse } from 'next/server';
import {
  listFarmerPayouts,
  processFarmerPayout,
  type InitiatePayoutRequest,
  type PayoutCurrency,
  type PayoutStatus,
} from '@/lib/farmers/paymentProcessing';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const farmerId = searchParams.get('farmerId') || undefined;
    const status = (searchParams.get('status') as PayoutStatus) || undefined;
    const currency = (searchParams.get('currency') as PayoutCurrency) || undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined;

    const payouts = listFarmerPayouts({ farmerId, status, currency, limit });

    return NextResponse.json({
      success: true,
      count: payouts.length,
      payouts,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to list farmer payments' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: InitiatePayoutRequest = await request.json();

    if (!body.farmerId || !body.farmerName || !body.sourceAmount || !body.targetCurrency || !body.destination) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: farmerId, farmerName, sourceAmount, targetCurrency, destination',
        },
        { status: 400 }
      );
    }

    const payout = processFarmerPayout(body);

    return NextResponse.json(
      {
        success: true,
        message: `Payout successfully processed to ${body.farmerName}`,
        payout,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to process farmer payout' },
      { status: 400 }
    );
  }
}
