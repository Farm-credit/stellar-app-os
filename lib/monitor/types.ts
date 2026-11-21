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

// ── RPC Node Health ──────────────────────────────────────────────────────────

export interface RpcNodeConfig {
  url: string;
  name: string;
  weight?: number;
}

export interface RpcNodeHealth {
  url: string;
  name: string;
  isHealthy: boolean;
  latencyMs: number | null;
  lastCheckedAt: number | null;
  consecutiveFailures: number;
  lastError: string | null;
}

export interface RpcHealthCheckResult {
  node: RpcNodeHealth;
  isHealthy: boolean;
  latencyMs: number;
}

export interface RpcHealthState {
  nodes: RpcNodeHealth[];
  bestNode: RpcNodeHealth | null;
  lastCheckAt: number | null;
}
