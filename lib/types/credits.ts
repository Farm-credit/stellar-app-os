export interface CreditHolding {
  projectId: string;
  projectName: string;
  quantity: number;
  vintage: number;
  status: 'active' | 'retired';
  pricePerTon: number;
  totalValue: number;
  assetCode: string;
  issuer: string;
}

export interface PortfolioStats {
  totalCredits: number;
  totalValue: number;
  activeCredits: number;
  retiredCredits: number;
  lastUpdated: number;
}

export interface PriceCache {
  [projectId: string]: {
    price: number;
    timestamp: number;
  };
}
