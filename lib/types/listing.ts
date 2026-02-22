export interface Credit {
  id: string;
  type: string;
  amount: number;
  issuer: string;
  vintage: string;
  metadata: {
    projectName: string;
    location: string;
    methodology: string;
    verificationStandard: string;
  };
}

export interface ListingFormData {
  creditId: string;
  pricePerCredit: number;
  quantity: number;
}

export interface ListingPreviewData extends ListingFormData {
  credit: Credit;
  totalValue: number;
  platformFee: number;
  netAmount: number;
}

export interface ListingResult {
  hash: string;
  listingId: string;
  offerData: {
    offerId: string;
    selling: string;
    buying: string;
    amount: string;
    price: string;
  };
}

export type ListingStep = 'form' | 'preview' | 'signing' | 'success';

export interface MarketPriceData {
  current: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  lastUpdated: Date;
}