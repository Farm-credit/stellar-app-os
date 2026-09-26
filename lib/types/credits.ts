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
  /** What the buyer paid for this holding (derived when absent). */
  purchaseCost?: number;
  /** ISO-8601 retirement date for retired credits, if known. */
  retirementDate?: string | null;
  /** Co-benefits attributed to the originating project. */
  coBenefits?: string[];
}

/**
 * A holding enriched for the buyer portfolio view: cost, retirement date and
 * co-benefits are always present so the UI does not need to re-derive them.
 */
export interface OwnedCredit extends CreditHolding {
  purchaseCost: number;
  retirementDate: string | null;
  coBenefits: string[];
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
