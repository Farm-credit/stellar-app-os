import { NextRequest, NextResponse } from 'next/server';
import { getFarmerPayoutById } from '@/lib/farmers/paymentProcessing';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const payout = getFarmerPayoutById(id);

    if (!payout) {
      return NextResponse.json(
        { success: false, error: `Payout record with ID '${id}' not found` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      payout,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch payout record' },
      { status: 500 }
    );
  }
}
