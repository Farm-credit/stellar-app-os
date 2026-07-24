export interface TreasuryAssetConfig {
  address: string;
  assetCode: string;
  assetIssuer: string;
}

export interface BalanceResult {
  address: string;
  assetCode: string;
  balance: number;
}

export interface CheckBalancesResult {
  balances: BalanceResult[];
  alerts: BalanceResult[];
  threshold: number;
}

export interface TreasuryCheckConfig {
  horizonUrl?: string;
  usdcIssuer?: string;
  plantingAddress?: string;
  replantingAddress?: string;
  usdcAlertThreshold?: number;
  notificationEmail?: string;
}
