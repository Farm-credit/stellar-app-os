import { NextResponse } from 'next/server';
import { getLiveExchangeRates, SUPPORTED_CURRENCIES } from '@/lib/currency/exchange-rates';
import { getXlmPerUsdcRate } from '@/lib/stellar/conversion';

export async function GET() {
  try {
    const rates = await getLiveExchangeRates();
    let xlmPerUsd: number | null = null;

    try {
      // Tree donations are settled as USD-denominated USDC. Reuse the same
      // Horizon path quote used by the transaction builder for the display
      // equivalent, while allowing the fiat quote to remain available if the
      // testnet has no XLM/USDC route.
      xlmPerUsd = await getXlmPerUsdcRate(1, 'testnet');
    } catch {
      // The checkout can still show fiat conversions when XLM liquidity is
      // temporarily unavailable.
    }

    return NextResponse.json(
      {
        success: true,
        baseCurrency: 'USD',
        supportedCurrencies: Object.values(SUPPORTED_CURRENCIES),
        rates,
        xlmPerUsd,
        fetchedAt: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200',
        },
      }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch live currency exchange rates' },
      { status: 500 }
    );
  }
}
