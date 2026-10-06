/**
 * Multi-chain farmer wallet — chain registry and fee-aware credit routing (#1310).
 *
 * Farmers can hold and trade carbon credits on Stellar (Soroban), Polygon and
 * Ethereum. Prices and fees differ per chain, so the same tonne of CO2e can cost
 * materially more depending on where it is bought or moved. This module keeps a
 * single source of truth for chain cost parameters and answers two questions:
 *
 *   - Which chain is cheapest to buy on right now?  → `compareChainPrices`
 *   - What is the cheapest way to end up holding N tonnes on chain X?
 *     → `planCreditTransfer`
 *
 * Everything here is pure and deterministic: quotes are supplied by the caller
 * (from the price oracle / DEX APIs), so the routing logic can be unit-tested
 * without touching an RPC node.
 */

import type {
  ChainDescriptor,
  ChainId,
  ChainPriceComparison,
  CreditQuote,
  CreditTransferRequest,
  MultiChainWalletSnapshot,
  RouteOption,
  RoutingResult,
} from '@/lib/types/multichain-wallet';

/**
 * Per-chain cost parameters. Gas figures are conservative working estimates used
 * for routing; they are refreshed by the ops pipeline rather than hard-coded in
 * the UI. Bridge fees are the platform's own bridge take, in basis points.
 */
export const CHAIN_REGISTRY: Record<ChainId, ChainDescriptor> = {
  stellar: {
    id: 'stellar',
    name: 'Stellar',
    kind: 'stellar',
    nativeSymbol: 'XLM',
    creditStandard: 'soroban',
    gasCostUsd: 0.0005,
    bridgeFeeBps: 5,
    settlementSeconds: 5,
  },
  polygon: {
    id: 'polygon',
    name: 'Polygon',
    kind: 'evm',
    nativeSymbol: 'POL',
    creditStandard: 'erc20',
    gasCostUsd: 0.02,
    bridgeFeeBps: 25,
    settlementSeconds: 30,
  },
  ethereum: {
    id: 'ethereum',
    name: 'Ethereum',
    kind: 'evm',
    nativeSymbol: 'ETH',
    creditStandard: 'erc20',
    gasCostUsd: 2.5,
    bridgeFeeBps: 30,
    settlementSeconds: 300,
  },
};

export const SUPPORTED_CHAINS: ChainId[] = ['stellar', 'polygon', 'ethereum'];

const round = (value: number, digits = 2) => Number(value.toFixed(digits));

/** All supported chains, in registry order. */
export function listChains(): ChainDescriptor[] {
  return SUPPORTED_CHAINS.map((id) => CHAIN_REGISTRY[id]);
}

/** Descriptor for a chain, throwing rather than returning a partial record. */
export function getChain(id: ChainId): ChainDescriptor {
  const chain = CHAIN_REGISTRY[id];
  if (!chain) throw new Error(`Unsupported chain: ${id}`);
  return chain;
}

function assertQuantity(quantityTonnes: number): void {
  if (!Number.isFinite(quantityTonnes) || quantityTonnes <= 0) {
    throw new Error('quantityTonnes must be greater than zero');
  }
}

/**
 * Keep the best (lowest-priced) quote per chain and validate the remainder.
 * Duplicate quotes are tolerated because callers often merge several data
 * sources; silently taking the cheapest avoids surprising the router.
 */
function normalizeQuotes(quotes: CreditQuote[]): Map<ChainId, CreditQuote> {
  if (!Array.isArray(quotes) || quotes.length === 0) {
    throw new Error('At least one credit quote is required');
  }

  const byChain = new Map<ChainId, CreditQuote>();
  for (const quote of quotes) {
    if (!SUPPORTED_CHAINS.includes(quote.chain)) {
      throw new Error(`Unsupported chain in quote: ${quote.chain}`);
    }
    if (!Number.isFinite(quote.pricePerTonne) || quote.pricePerTonne <= 0) {
      throw new Error(`pricePerTonne must be greater than zero for ${quote.chain}`);
    }
    if (!Number.isFinite(quote.availableTonnes) || quote.availableTonnes < 0) {
      throw new Error(`availableTonnes must be zero or greater for ${quote.chain}`);
    }
    const existing = byChain.get(quote.chain);
    if (!existing || quote.pricePerTonne < existing.pricePerTonne) {
      byChain.set(quote.chain, quote);
    }
  }
  return byChain;
}

/** USD bridge fee for moving `valueUsd` of credits off `chain`. */
export function bridgeFeeUsd(chain: ChainId, valueUsd: number): number {
  if (!Number.isFinite(valueUsd) || valueUsd < 0) {
    throw new Error('valueUsd must be zero or greater');
  }
  return round((valueUsd * getChain(chain).bridgeFeeBps) / 10_000);
}

/** Rank chains by purchase price, considering only chains with enough supply. */
export function compareChainPrices(
  quotes: CreditQuote[],
  options: { quantityTonnes?: number } = {}
): ChainPriceComparison {
  const quantity = options.quantityTonnes ?? 0;
  const byChain = normalizeQuotes(quotes);

  const eligible = [...byChain.values()].filter((quote) => quote.availableTonnes >= quantity);
  if (eligible.length === 0) {
    throw new Error(`No chain has ${quantity} tonnes available`);
  }

  const ranked = [...eligible].sort((a, b) => a.pricePerTonne - b.pricePerTonne);
  const cheapest = ranked[0];
  const mostExpensive = ranked[ranked.length - 1];
  const spreadPerTonneUsd = round(mostExpensive.pricePerTonne - cheapest.pricePerTonne);

  return {
    cheapest,
    mostExpensive,
    spreadPerTonneUsd,
    spreadPercent: round(spreadPerTonneUsd / mostExpensive.pricePerTonne, 4),
    ranked,
  };
}

function purchaseRoute(chain: ChainDescriptor, quote: CreditQuote, quantity: number): RouteOption {
  const creditCostUsd = round(quantity * quote.pricePerTonne);
  const gasCostUsd = chain.gasCostUsd;
  const totalCostUsd = round(creditCostUsd + gasCostUsd);
  return {
    strategy: 'purchase',
    sourceChain: chain.id,
    destinationChain: chain.id,
    quantityTonnes: quantity,
    unitPrice: quote.pricePerTonne,
    creditCostUsd,
    bridgeFeeUsd: 0,
    gasCostUsd,
    totalCostUsd,
    effectivePricePerTonne: round(totalCostUsd / quantity),
    estimatedSettlementSeconds: chain.settlementSeconds,
  };
}

function bridgeRoute(
  source: ChainDescriptor,
  destination: ChainDescriptor,
  unitPrice: number,
  quantity: number
): RouteOption {
  const valueUsd = round(quantity * unitPrice);
  const fee = bridgeFeeUsd(source.id, valueUsd);
  const gasCostUsd = round(source.gasCostUsd + destination.gasCostUsd);
  const totalCostUsd = round(fee + gasCostUsd);
  return {
    strategy: 'bridge',
    sourceChain: source.id,
    destinationChain: destination.id,
    quantityTonnes: quantity,
    unitPrice,
    creditCostUsd: 0,
    bridgeFeeUsd: fee,
    gasCostUsd,
    totalCostUsd,
    effectivePricePerTonne: round(totalCostUsd / quantity),
    estimatedSettlementSeconds: source.settlementSeconds + destination.settlementSeconds,
  };
}

/**
 * Rank every viable way to end up holding `quantityTonnes` of credits:
 * buying outright on any chain with enough supply, or bridging existing
 * holdings onto the destination chain.
 */
export function planCreditTransfer(request: CreditTransferRequest): RoutingResult {
  assertQuantity(request.quantityTonnes);

  const excluded = new Set(request.excludeChains ?? []);
  const byChain = normalizeQuotes(request.quotes);
  const quantity = request.quantityTonnes;

  const available = [...byChain.values()]
    .filter((quote) => !excluded.has(quote.chain))
    .filter((quote) => quote.availableTonnes >= quantity);

  let destinationId: ChainId | null = null;
  if (request.destinationChain && !excluded.has(request.destinationChain)) {
    destinationId = request.destinationChain;
  } else if (available.length > 0) {
    destinationId = available.reduce((best, quote) =>
      quote.pricePerTonne < best.pricePerTonne ? quote : best
    ).chain;
  }

  if (!destinationId) {
    throw new Error('No viable route: every candidate chain was excluded or lacks supply');
  }
  const destination = getChain(destinationId);

  const routes: RouteOption[] = [];

  // 1. Buy outright on any chain with enough supply.
  for (const quote of available) {
    routes.push(purchaseRoute(getChain(quote.chain), quote, quantity));
  }

  // 2. Bridge credits the farmer already holds onto the destination chain.
  for (const sourceId of SUPPORTED_CHAINS) {
    if (excluded.has(sourceId) || sourceId === destinationId) continue;
    const held = request.balances?.[sourceId] ?? 0;
    if (held < quantity) continue;

    // Value the bridged credits at the source chain's market price, falling
    // back to the destination's quote so the fee basis is never zero by accident.
    const unitPrice =
      byChain.get(sourceId)?.pricePerTonne ??
      byChain.get(destinationId)?.pricePerTonne ??
      Math.min(...[...byChain.values()].map((quote) => quote.pricePerTonne));

    routes.push(bridgeRoute(getChain(sourceId), destination, unitPrice, quantity));
  }

  if (routes.length === 0) {
    throw new Error(`No viable route to obtain ${quantity} tonnes on ${destinationId}`);
  }

  const sorted = [...routes].sort(
    (a, b) =>
      a.totalCostUsd - b.totalCostUsd || a.estimatedSettlementSeconds - b.estimatedSettlementSeconds
  );
  const recommended = sorted[0];
  const mostExpensive = sorted[sorted.length - 1];

  return {
    quantityTonnes: quantity,
    recommended,
    alternatives: sorted,
    savingsVsMostExpensiveUsd: round(mostExpensive.totalCostUsd - recommended.totalCostUsd),
  };
}

/**
 * Mark-to-market a wallet snapshot: credits per chain valued at the supplied
 * quotes, plus gas-free totals for the dashboard.
 */
export function valueWallet(
  snapshot: MultiChainWalletSnapshot,
  quotes: CreditQuote[]
): {
  perChain: Array<{ chain: ChainId; tonnes: number; unitPrice: number; valueUsd: number }>;
  totalTonnes: number;
  totalValueUsd: number;
} {
  const byChain = normalizeQuotes(quotes);
  const perChain = SUPPORTED_CHAINS.map((chain) => {
    const tonnes = snapshot.creditBalances?.[chain] ?? 0;
    const unitPrice = byChain.get(chain)?.pricePerTonne ?? 0;
    return { chain, tonnes, unitPrice, valueUsd: round(tonnes * unitPrice) };
  });

  return {
    perChain,
    totalTonnes: round(
      perChain.reduce((sum, entry) => sum + entry.tonnes, 0),
      4
    ),
    totalValueUsd: round(perChain.reduce((sum, entry) => sum + entry.valueUsd, 0)),
  };
}
