import type { Credit, ListingResult, MarketPriceData } from '@/lib/types/listing';

export function fetchUserCredits(_publicKey: string): Promise<Credit[]> {
  return Promise.resolve([
    {
      id: 'CARBON_SOLAR_001',
      type: 'Solar Carbon Credit',
      amount: 100,
      issuer: 'GCXAMPLE1234567890ABCDEF',
      vintage: '2024',
      metadata: {
        projectName: 'Solar Farm Project Alpha',
        location: 'California, USA',
        methodology: 'VCS',
        verificationStandard: 'Verified Carbon Standard',
      },
    },
    {
      id: 'CARBON_WIND_002',
      type: 'Wind Carbon Credit',
      amount: 75,
      issuer: 'GCXAMPLE1234567890ABCDEF',
      vintage: '2024',
      metadata: {
        projectName: 'Wind Farm Project Beta',
        location: 'Texas, USA',
        methodology: 'CDM',
        verificationStandard: 'Clean Development Mechanism',
      },
    },
  ]);
}

export function fetchMarketPrice(_creditType: string): Promise<MarketPriceData> {
  return Promise.resolve({
    current: 10.5,
    high24h: 11.2,
    low24h: 10.1,
    volume24h: 1500,
    lastUpdated: new Date(),
  });
}

export async function createListing(
  _wallet: unknown,
  params: { credit: Credit; pricePerCredit: number; quantity: number }
): Promise<ListingResult> {
  await new Promise((resolve) => setTimeout(resolve, 2000));

  return {
    hash: 'TXHASH' + Math.random().toString(36).substring(7),
    listingId: 'LIST' + Math.random().toString(36).substring(7),
    offerData: {
      offerId: 'offer_' + Date.now(),
      selling: params.credit.id,
      buying: 'XLM',
      amount: params.quantity.toString(),
      price: params.pricePerCredit.toString(),
    },
  };
}

export function validateCreditOwnership(
  _publicKey: string,
  _creditId: string,
  _quantity: number
): Promise<boolean> {
  return Promise.resolve(true);
}

export function checkExistingListings(_publicKey: string, _creditId: string): Promise<boolean> {
  return Promise.resolve(false);
}
