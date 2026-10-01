'use client';

/**
 * useMultiChainWallet — client-side state for the farmer's multi-chain credit wallet.
 *
 * Manages:
 *  - live credit quotes (refreshable)
 *  - wallet snapshot (credit balances per chain)
 *  - routing result from /api/wallet/multichain
 *  - price comparison result
 */

import { useState, useCallback, useRef } from 'react';
import type {
  ChainId,
  ChainPriceComparison,
  CreditQuote,
  CreditTransferRequest,
  MultiChainWalletSnapshot,
  RoutingResult,
} from '@/lib/types/multichain-wallet';
import { valueWallet } from '@/lib/wallet/multichain';

export interface WalletValuation {
  perChain: Array<{ chain: ChainId; tonnes: number; unitPrice: number; valueUsd: number }>;
  totalTonnes: number;
  totalValueUsd: number;
}

export interface MultiChainWalletState {
  /** Live market quotes per chain. */
  quotes: CreditQuote[];
  /** Farmer's current credit balances. */
  snapshot: MultiChainWalletSnapshot;
  /** Mark-to-market valuation derived from quotes + snapshot. */
  valuation: WalletValuation | null;
  /** Result of the last planCreditTransfer call. */
  routingResult: RoutingResult | null;
  /** Result of the last compareChainPrices call. */
  priceComparison: ChainPriceComparison | null;
  /** Whether a network call is in-flight. */
  isLoading: boolean;
  /** Last error message, if any. */
  error: string | null;
}

type ApiRoutingBody = CreditTransferRequest & { mode?: 'route' | 'compare' };

async function callMultichainApi(body: ApiRoutingBody): Promise<{ mode: string; result: unknown }> {
  const res = await fetch('/api/wallet/multichain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data: unknown = await res.json();
  if (!res.ok) {
    const err = data as { error?: string; details?: string[] };
    throw new Error(err?.details?.join(', ') ?? err?.error ?? 'API error');
  }
  return data as { mode: string; result: unknown };
}

/** Seed quotes used while real oracle data loads / in demo mode. */
const DEMO_QUOTES: CreditQuote[] = [
  { chain: 'stellar', pricePerTonne: 42.5, availableTonnes: 500 },
  { chain: 'polygon', pricePerTonne: 41.2, availableTonnes: 320 },
  { chain: 'ethereum', pricePerTonne: 44.8, availableTonnes: 120 },
];

const EMPTY_SNAPSHOT: MultiChainWalletSnapshot = {
  addresses: {},
  creditBalances: {},
};

export function useMultiChainWallet() {
  const [state, setState] = useState<MultiChainWalletState>({
    quotes: DEMO_QUOTES,
    snapshot: EMPTY_SNAPSHOT,
    valuation: null,
    routingResult: null,
    priceComparison: null,
    isLoading: false,
    error: null,
  });

  // Prevent concurrent in-flight calls.
  const inflightRef = useRef(false);

  const setLoading = (isLoading: boolean) =>
    setState((prev) => ({ ...prev, isLoading, error: isLoading ? null : prev.error }));

  const setError = (error: string | null) =>
    setState((prev) => ({ ...prev, error, isLoading: false }));

  /**
   * Update the wallet snapshot (balances + addresses) and recompute the
   * mark-to-market valuation against the current quotes.
   */
  const updateSnapshot = useCallback((snapshot: MultiChainWalletSnapshot) => {
    setState((prev) => {
      const valuation = valueWallet(snapshot, prev.quotes);
      return { ...prev, snapshot, valuation };
    });
  }, []);

  /**
   * Set fresh market quotes and recompute valuation.
   * Call this when a price oracle push arrives or the user hits "Refresh".
   */
  const updateQuotes = useCallback((quotes: CreditQuote[]) => {
    setState((prev) => {
      const valuation = valueWallet(prev.snapshot, quotes);
      return { ...prev, quotes, valuation };
    });
  }, []);

  /**
   * Ask the API for the cheapest route to acquire / relocate credits.
   */
  const planTransfer = useCallback(async (request: CreditTransferRequest) => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    setLoading(true);
    try {
      const { result } = await callMultichainApi({ ...request, mode: 'route' });
      setState((prev) => ({
        ...prev,
        routingResult: result as RoutingResult,
        isLoading: false,
        error: null,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to plan transfer');
    } finally {
      inflightRef.current = false;
    }
  }, []);

  /**
   * Ask the API to rank chains by purchase price only (no bridging considered).
   */
  const compareChains = useCallback(async (quotes: CreditQuote[], quantityTonnes?: number) => {
    if (inflightRef.current) return;
    inflightRef.current = true;
    setLoading(true);
    try {
      const { result } = await callMultichainApi({
        mode: 'compare',
        quotes,
        quantityTonnes: quantityTonnes ?? 1,
      } as ApiRoutingBody);
      setState((prev) => ({
        ...prev,
        priceComparison: result as ChainPriceComparison,
        isLoading: false,
        error: null,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to compare chains');
    } finally {
      inflightRef.current = false;
    }
  }, []);

  /** Clear any previously displayed routing result. */
  const clearResult = useCallback(() => {
    setState((prev) => ({ ...prev, routingResult: null, priceComparison: null, error: null }));
  }, []);

  return {
    ...state,
    updateSnapshot,
    updateQuotes,
    planTransfer,
    compareChains,
    clearResult,
  };
}
