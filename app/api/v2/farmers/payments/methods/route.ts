import { NextResponse } from 'next/server';
import {
  getSupportedPaymentChannels,
  BASE_EXCHANGE_RATES,
} from '@/lib/farmers/paymentProcessing';

export async function GET() {
  try {
    const channels = getSupportedPaymentChannels();
    return NextResponse.json({
      success: true,
      channels,
      supportedCurrencies: Object.keys(BASE_EXCHANGE_RATES),
      exchangeRatesUsdBase: BASE_EXCHANGE_RATES,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to retrieve payout methods' },
      { status: 500 }
    );
  }
}
