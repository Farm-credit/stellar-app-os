/**
 * Types for the multi-chain farmer wallet (#1310).
 *
 * A farmer's credits can sit on Stellar (Soroban), Polygon or Ethereum. The
 * wallet unifies the three into a single view and the router picks the cheapest
 * way to acquire or relocate credits — buying on the cheapest chain, or
 * bridging holdings when the fee is lower than repurchasing.
 */

export type ChainId = 'stellar' | 'polygon' | 'ethereum';

export type ChainKind = 'stellar' | 'evm';

export interface ChainDescriptor {
  id: ChainId;
  name: string;
  kind: ChainKind;
  /** Native gas token symbol. */
  nativeSymbol: string;
  /** How the platform's carbon credit token is represented on this chain. */
  creditStandard: 'soroban' | 'erc20';
  /** Typical USD cost of a single settlement transaction, in USD. */
  gasCostUsd: number;
  /** Bridge fee to move credits off this chain, in basis points (1 bp = 0.01%). */
  bridgeFeeBps: number;
  /** Typical time to finality for a credit transfer, in seconds. */
  settlementSeconds: number;
}

export interface CreditQuote {
  chain: ChainId;
  /** Market price for one tonne of CO2e on this chain, in USD. */
  pricePerTonne: number;
  /** Tonnes available to buy at that price. */
  availableTonnes: number;
}

export interface MultiChainWalletSnapshot {
  /** Farmer-controlled addresses, keyed by chain. */
  addresses: Partial<Record<ChainId, string>>;
  /** Credits held per chain, in tonnes. */
  creditBalances: Partial<Record<ChainId, number>>;
}

export type RouteStrategy = 'purchase' | 'bridge';

export interface CreditTransferRequest {
  quantityTonnes: number;
  /** Market quotes to consider. At most one per chain. */
  quotes: CreditQuote[];
  /** Optional existing holdings; enables bridging routes. */
  balances?: Partial<Record<ChainId, number>>;
  /** Chain the farmer wants to end up holding the credits on. */
  destinationChain?: ChainId;
  /** Chains to exclude from consideration (e.g. a paused bridge). */
  excludeChains?: ChainId[];
}

export interface RouteOption {
  strategy: RouteStrategy;
  /** Chain the credits are acquired from or held on today. */
  sourceChain: ChainId;
  /** Chain the credits end up on; equal to `sourceChain` for a direct purchase. */
  destinationChain: ChainId;
  quantityTonnes: number;
  unitPrice: number;
  /** Credit cost: `0` for a bridge of already-owned credits. */
  creditCostUsd: number;
  bridgeFeeUsd: number;
  gasCostUsd: number;
  totalCostUsd: number;
  effectivePricePerTonne: number;
  estimatedSettlementSeconds: number;
}

export interface RoutingResult {
  quantityTonnes: number;
  recommended: RouteOption;
  /** Every viable route, cheapest first (includes `recommended`). */
  alternatives: RouteOption[];
  /** How much more the most expensive route would cost than the recommended one. */
  savingsVsMostExpensiveUsd: number;
}

export interface ChainPriceComparison {
  cheapest: CreditQuote;
  mostExpensive: CreditQuote;
  /** Absolute spread between the cheapest and most expensive purchase price. */
  spreadPerTonneUsd: number;
  /** Spread as a fraction of the most expensive price. */
  spreadPercent: number;
  /** Price per chain, ascending. */
  ranked: CreditQuote[];
}
