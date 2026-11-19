import { NextRequest, NextResponse } from 'next/server';
import {
  calculatePayoutQuote,
  type PayoutQuoteRequest,
} from '@/lib/farmers/paymentProcessing';

export async function POST(request: NextRequest) {
  try {
    const body: PayoutQuoteRequest = await request.json();

    if (!body.farmerId || !body.sourceAmount || !body.sourceCurrency || !body.targetCurrency || !body.channel) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required parameters for quote calculation (farmerId, sourceAmount, sourceCurrency, targetCurrency, channel)',
        },
        { status: 400 }
      );
    }

    const quote = calculatePayoutQuote(body);

    return NextResponse.json({
      success: true,
      quote,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate payout quote' },
      { status: 400 }
    );
  }
}
