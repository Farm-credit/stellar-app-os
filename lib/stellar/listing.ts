import type { Credit, ListingResult, MarketPriceData } from '@/lib/types/listing';

interface WalletState {
  publicKey: string;
  network: 'mainnet' | 'testnet';
  isConnected: boolean;
  type: string;
}

// eslint-disable-next-line no-unused-vars
export function fetchUserCredits(_publicKey: string): Promise<Credit[]> {
  // Mock implementation - replace with actual Stellar SDK calls later
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

// eslint-disable-next-line no-unused-vars
export function fetchMarketPrice(_creditType: string): Promise<MarketPriceData> {
  // Mock implementation
  return Promise.resolve({
    current: 10.5,
    high24h: 11.2,
    low24h: 10.1,
    volume24h: 1500,
    lastUpdated: new Date(),
  });
}

export async function createListing(
  wallet: WalletState,
  params: { credit: Credit; pricePerCredit: number; quantity: number }
): Promise<ListingResult> {
  // Mock implementation - simulate API delay
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
  // eslint-disable-next-line no-unused-vars
  _publicKey: string,
  // eslint-disable-next-line no-unused-vars
  _creditId: string,
  // eslint-disable-next-line no-unused-vars
  _quantity: number
): Promise<boolean> {
  // Mock validation - always return true for demo
  return Promise.resolve(true);
}

// eslint-disable-next-line no-unused-vars
export function checkExistingListings(_publicKey: string, _creditId: string): Promise<boolean> {
  // Mock check - always return false for demo
  return Promise.resolve(false);
}
