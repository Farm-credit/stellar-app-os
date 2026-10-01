import { describe, expect, it } from 'vitest';
import {
  CHAIN_REGISTRY,
  bridgeFeeUsd,
  compareChainPrices,
  getChain,
  listChains,
  planCreditTransfer,
  valueWallet,
} from '@/lib/wallet/multichain';
import type { CreditQuote } from '@/lib/types/multichain-wallet';

const QUOTES: CreditQuote[] = [
  { chain: 'stellar', pricePerTonne: 42.5, availableTonnes: 500 },
  { chain: 'polygon', pricePerTonne: 41.2, availableTonnes: 320 },
  { chain: 'ethereum', pricePerTonne: 44.8, availableTonnes: 120 },
];

describe('chain registry', () => {
  it('lists every supported chain in registry order', () => {
    expect(listChains().map((chain) => chain.id)).toEqual(['stellar', 'polygon', 'ethereum']);
  });

  it('exposes the credit standard used on each chain', () => {
    expect(getChain('stellar').creditStandard).toBe('soroban');
    expect(getChain('polygon').creditStandard).toBe('erc20');
    expect(getChain('ethereum').creditStandard).toBe('erc20');
  });

  it('makes Stellar the cheapest chain to settle on', () => {
    expect(CHAIN_REGISTRY.stellar.gasCostUsd).toBeLessThan(CHAIN_REGISTRY.polygon.gasCostUsd);
    expect(CHAIN_REGISTRY.polygon.gasCostUsd).toBeLessThan(CHAIN_REGISTRY.ethereum.gasCostUsd);
  });
});

describe('bridgeFeeUsd', () => {
  it('applies the chain fee in basis points', () => {
    // 25 bps of $1,000 = $2.50
    expect(bridgeFeeUsd('polygon', 1_000)).toBeCloseTo(2.5, 2);
    expect(bridgeFeeUsd('ethereum', 1_000)).toBeCloseTo(3, 2);
    expect(bridgeFeeUsd('stellar', 1_000)).toBeCloseTo(0.5, 2);
  });

  it('rejects negative value', () => {
    expect(() => bridgeFeeUsd('stellar', -1)).toThrow('valueUsd must be zero or greater');
  });
});

describe('compareChainPrices', () => {
  it('ranks chains from cheapest to most expensive', () => {
    const comparison = compareChainPrices(QUOTES);
    expect(comparison.ranked.map((quote) => quote.chain)).toEqual([
      'polygon',
      'stellar',
      'ethereum',
    ]);
    expect(comparison.cheapest.chain).toBe('polygon');
    expect(comparison.mostExpensive.chain).toBe('ethereum');
    expect(comparison.spreadPerTonneUsd).toBeCloseTo(3.6, 2);
    expect(comparison.spreadPercent).toBeCloseTo(3.6 / 44.8, 3);
  });

  it('ignores chains without enough supply for the requested size', () => {
    const comparison = compareChainPrices(QUOTES, { quantityTonnes: 200 });
    expect(comparison.ranked.map((quote) => quote.chain)).toEqual(['polygon', 'stellar']);
  });

  it('throws when no chain can fill the order', () => {
    expect(() => compareChainPrices(QUOTES, { quantityTonnes: 10_000 })).toThrow(
      'No chain has 10000 tonnes available'
    );
  });

  it('keeps the cheapest of duplicate quotes for a chain', () => {
    const comparison = compareChainPrices([
      ...QUOTES,
      { chain: 'polygon', pricePerTonne: 39.9, availableTonnes: 50 },
    ]);
    expect(comparison.cheapest.pricePerTonne).toBe(39.9);
  });
});

describe('planCreditTransfer', () => {
  it('buys on the cheapest chain when the farmer holds no credits', () => {
    const result = planCreditTransfer({ quantityTonnes: 25, quotes: QUOTES });
    expect(result.recommended.strategy).toBe('purchase');
    expect(result.recommended.sourceChain).toBe('polygon');
    expect(result.recommended.destinationChain).toBe('polygon');
    expect(result.recommended.creditCostUsd).toBeCloseTo(1030, 2);
    expect(result.alternatives).toHaveLength(3);
  });

  it('prefers bridging existing holdings over repurchasing', () => {
    const result = planCreditTransfer({
      quantityTonnes: 25,
      quotes: QUOTES,
      balances: { polygon: 40 },
      destinationChain: 'stellar',
    });
    expect(result.recommended.strategy).toBe('bridge');
    expect(result.recommended.sourceChain).toBe('polygon');
    expect(result.recommended.destinationChain).toBe('stellar');
    // Bridging fees + gas must beat buying 25 tonnes outright.
    expect(result.recommended.totalCostUsd).toBeLessThan(5);
    expect(result.recommended.effectivePricePerTonne).toBeLessThan(1);
  });

  it('honours an explicit destination chain', () => {
    const result = planCreditTransfer({
      quantityTonnes: 10,
      quotes: QUOTES,
      balances: { polygon: 40 },
      destinationChain: 'ethereum',
    });
    expect(result.recommended.destinationChain).toBe('ethereum');
    expect(result.recommended.sourceChain).toBe('polygon');
  });

  it('excludes chains that are unavailable', () => {
    const result = planCreditTransfer({
      quantityTonnes: 25,
      quotes: QUOTES,
      excludeChains: ['polygon'],
      destinationChain: 'stellar',
    });
    expect(result.alternatives.some((route) => route.sourceChain === 'polygon')).toBe(false);
  });

  it('reports the saving over the most expensive route', () => {
    const result = planCreditTransfer({ quantityTonnes: 25, quotes: QUOTES });
    const mostExpensive = result.alternatives[result.alternatives.length - 1];
    expect(result.savingsVsMostExpensiveUsd).toBeCloseTo(
      mostExpensive.totalCostUsd - result.recommended.totalCostUsd,
      2
    );
    expect(result.savingsVsMostExpensiveUsd).toBeGreaterThan(0);
  });

  it('does not bridge when holdings are below the requested quantity', () => {
    const result = planCreditTransfer({
      quantityTonnes: 100,
      quotes: QUOTES,
      balances: { polygon: 40 },
      destinationChain: 'stellar',
    });
    expect(result.alternatives.every((route) => route.strategy === 'purchase')).toBe(true);
  });

  it('does not bridge onto the chain the credits already sit on', () => {
    const result = planCreditTransfer({
      quantityTonnes: 10,
      quotes: QUOTES,
      balances: { stellar: 50 },
      destinationChain: 'stellar',
    });
    expect(result.alternatives.some((route) => route.strategy === 'bridge')).toBe(false);
  });

  it('validates the request', () => {
    expect(() => planCreditTransfer({ quantityTonnes: 0, quotes: QUOTES })).toThrow(
      'quantityTonnes must be greater than zero'
    );
    expect(() => planCreditTransfer({ quantityTonnes: 1, quotes: [] })).toThrow(
      'At least one credit quote is required'
    );
    expect(() =>
      planCreditTransfer({
        quantityTonnes: 1,
        quotes: [{ chain: 'avalanche' as never, pricePerTonne: 1, availableTonnes: 1 }],
      })
    ).toThrow('Unsupported chain in quote: avalanche');
  });

  it('throws when every route is excluded', () => {
    expect(() =>
      planCreditTransfer({
        quantityTonnes: 1,
        quotes: QUOTES,
        excludeChains: ['stellar', 'polygon', 'ethereum'],
      })
    ).toThrow('every candidate chain was excluded');
  });
});

describe('valueWallet', () => {
  it('marks credit balances to market per chain', () => {
    const valuation = valueWallet(
      { addresses: { stellar: 'GABC' }, creditBalances: { stellar: 10, polygon: 5 } },
      QUOTES
    );
    const stellar = valuation.perChain.find((entry) => entry.chain === 'stellar');
    const polygon = valuation.perChain.find((entry) => entry.chain === 'polygon');
    expect(stellar?.valueUsd).toBeCloseTo(425, 2);
    expect(polygon?.valueUsd).toBeCloseTo(206, 2);
    expect(valuation.totalTonnes).toBe(15);
    expect(valuation.totalValueUsd).toBeCloseTo(631, 2);
  });
});
