import { NextResponse } from 'next/server';
import { getLiveExchangeRates, SUPPORTED_CURRENCIES } from '@/lib/currency/exchange-rates';

export async function GET() {
  try {
    const rates = await getLiveExchangeRates();

    return NextResponse.json(
      {
        success: true,
        baseCurrency: 'USD',
        supportedCurrencies: Object.values(SUPPORTED_CURRENCIES),
        rates,
        fetchedAt: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200',
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch live currency exchange rates' },
      { status: 500 }
    );
  }
}
