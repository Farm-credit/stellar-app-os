'use client';

import { useQuery } from '@tanstack/react-query';
import { useWalletContext } from '@/contexts/WalletContext';
import { fetchBalance } from '@/lib/stellar/wallet';
import type { WalletBalance } from '@/lib/types/wallet';

const EMPTY_BALANCE: WalletBalance = { xlm: '0.0000000', usdc: '0.0000000' };

/**
 * Default auto-polling interval for token balances, in milliseconds.
 */
export const DEFAULT_BALANCE_POLL_INTERVAL = 15_000;

export interface UseTokenBalancesResult {
  balance: WalletBalance;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  /** Whether a wallet is connected — balances are only meaningful when true. */
  isConnected: boolean;
}

/**
 * Fetches the connected wallet's XLM + USDC balances and keeps them fresh by
 * auto-polling on an interval. Layers TanStack Query's `refetchInterval` on top of
 * the existing `fetchBalance` service rather than the raw `setInterval` used by
 * `useWallet`, so it participates in the app-wide `QueryProvider` cache.
 *
 * @param pollInterval Polling interval in ms. Pass `0`/`false` to disable auto-polling.
 */
export function useTokenBalances(
  pollInterval: number | false = DEFAULT_BALANCE_POLL_INTERVAL
): UseTokenBalancesResult {
  const { wallet } = useWalletContext();
  const publicKey = wallet?.publicKey;
  const network = wallet?.network;
  const isConnected = Boolean(wallet?.isConnected && publicKey);

  const query = useQuery({
    queryKey: ['token-balances', publicKey, network],
    queryFn: () => fetchBalance(publicKey as string, network),
    enabled: isConnected,
    // Only poll while connected and while the tab is visible.
    refetchInterval: isConnected ? pollInterval : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  return {
    balance: query.data ?? EMPTY_BALANCE,
    isLoading: query.isLoading && isConnected,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: () => {
      void query.refetch();
    },
    isConnected,
  };
}
