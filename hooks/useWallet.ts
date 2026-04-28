import { useState, useCallback, useEffect } from 'react';
import type { WalletType, NetworkType, WalletConnection } from '@/lib/types/wallet';
import {
  connectFreighter,
  connectAlbedo,
  fetchBalance,
  getFreighterNetwork,
} from '@/lib/stellar/wallet';
import { signTransactionWithFreighter, signTransactionWithAlbedo } from '@/lib/stellar/signing';

export function useWallet() {
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Poll for network changes in Freighter
  useEffect(() => {
    if (wallet?.type === 'freighter') {
      const interval = setInterval(async () => {
        try {
          const freighterNetwork = await getFreighterNetwork();
          if (freighterNetwork && freighterNetwork !== wallet.network) {
            console.log(`Freighter network changed: ${freighterNetwork}`);
            // Auto-switch network if it changes in Freighter
            const balance = await fetchBalance(wallet.publicKey, freighterNetwork);
            const updatedWallet: WalletConnection = {
              ...wallet,
              network: freighterNetwork,
              balance,
            };
            setWallet(updatedWallet);
            localStorage.setItem('wallet_connection', JSON.stringify(updatedWallet));
          }
        } catch (err) {
          console.error('Error polling Freighter network:', err);
        }
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [wallet]);

  const connect = useCallback(async (type: WalletType, network: NetworkType = 'testnet') => {
    setIsLoading(true);
    setError(null);

    try {
      let publicKey: string;
      let targetNetwork = network;

      switch (type) {
        case 'freighter':
          // For Freighter, try to detect the network first
          const freighterNetwork = await getFreighterNetwork();
          if (freighterNetwork) {
            targetNetwork = freighterNetwork;
          }
          publicKey = await connectFreighter(targetNetwork);
          break;
        case 'albedo':
          publicKey = await connectAlbedo(targetNetwork);
          break;
        case 'custodial':
          throw new Error('Custodial wallets are not supported');
        default:
          throw new Error(`Unsupported wallet type: ${type}`);
      }

      const balance = await fetchBalance(publicKey, targetNetwork);

      const connection: WalletConnection = {
        type,
        publicKey,
        network: targetNetwork,
        isConnected: true,
        balance,
      };

      setWallet(connection);

      if (typeof window !== 'undefined') {
        localStorage.setItem('wallet_connection', JSON.stringify(connection));
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect wallet';
      setError(errorMessage);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('wallet_connection');
    }
    setWallet(null);
    setError(null);
  }, []);

  const switchNetwork = useCallback(
    async (network: NetworkType) => {
      if (!wallet) {
        throw new Error('No wallet connected');
      }

      setIsLoading(true);
      setError(null);

      try {
        const balance = await fetchBalance(wallet.publicKey, network);
        const updatedWallet: WalletConnection = {
          ...wallet,
          network,
          balance,
        };

        setWallet(updatedWallet);

        if (typeof window !== 'undefined') {
          localStorage.setItem('wallet_connection', JSON.stringify(updatedWallet));
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to switch network';
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [wallet]
  );

  const refreshBalance = useCallback(async () => {
    if (!wallet) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const balance = await fetchBalance(wallet.publicKey, wallet.network);
      const updatedWallet: WalletConnection = {
        ...wallet,
        balance,
      };

      setWallet(updatedWallet);

      if (typeof window !== 'undefined') {
        localStorage.setItem('wallet_connection', JSON.stringify(updatedWallet));
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to refresh balance';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [wallet]);

  const signTransaction = useCallback(
    async (transactionXdr: string, networkPassphrase: string) => {
      if (!wallet) {
        throw new Error('No wallet connected');
      }

      try {
        switch (wallet.type) {
          case 'freighter':
            return await signTransactionWithFreighter(transactionXdr, networkPassphrase);
          case 'albedo':
            return await signTransactionWithAlbedo(transactionXdr, wallet.network);
          default:
            throw new Error(`Signing not supported for wallet type: ${wallet.type}`);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to sign transaction';
        setError(errorMessage);
        throw err;
      }
    },
    [wallet]
  );

  const loadPersistedConnection = useCallback(() => {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem('wallet_connection');
      if (stored) {
        const connection = JSON.parse(stored) as WalletConnection;
        if (connection.type === 'custodial') {
          localStorage.removeItem('wallet_connection');
          return;
        }
        setWallet(connection);
        // Balance will be refreshed by the component using the provider if needed
        // but let's refresh it here too for consistency
        fetchBalance(connection.publicKey, connection.network)
          .then((balance) => {
            setWallet((prev) => (prev ? { ...prev, balance } : null));
          })
          .catch(console.error);
      }
    } catch (err) {
      console.error('Failed to load persisted wallet connection:', err);
      localStorage.removeItem('wallet_connection');
    }
  }, []);

  return {
    wallet,
    connect,
    disconnect,
    switchNetwork,
    refreshBalance,
    signTransaction,
    isLoading,
    error,
    loadPersistedConnection,
  };
}
