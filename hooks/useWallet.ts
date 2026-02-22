import { useState, useCallback } from "react";
import type { WalletType, NetworkType, WalletConnection } from "@/lib/types/wallet";
import {
  connectFreighter,
  connectAlbedo,
  fetchBalance,
} from "@/lib/stellar/wallet";

export function useWallet() {
  const [wallet, setWallet] = useState<WalletConnection | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(
    async (type: WalletType, network: NetworkType = "testnet") => {
      setIsLoading(true);
      setError(null);

      try {
        let publicKey: string;

        switch (type) {
          case "freighter":
            publicKey = await connectFreighter(network);
            break;
          case "albedo":
            publicKey = await connectAlbedo(network);
            break;
          case "custodial":
            throw new Error("Custodial wallets are not supported");
          default:
            throw new Error(`Unsupported wallet type: ${type}`);
        }

        const balance = await fetchBalance(publicKey, network);

        const connection: WalletConnection = {
          type,
          publicKey,
          network,
          isConnected: true,
          balance,
        };

        setWallet(connection);
        
        if (typeof window !== "undefined") {
          localStorage.setItem("wallet_connection", JSON.stringify(connection));
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to connect wallet";
        setError(errorMessage);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const disconnect = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("wallet_connection");
    }
    setWallet(null);
    setError(null);
  }, []);

  const switchNetwork = useCallback(
    async (network: NetworkType) => {
      if (!wallet) {
        throw new Error("No wallet connected");
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
        
        if (typeof window !== "undefined") {
          localStorage.setItem("wallet_connection", JSON.stringify(updatedWallet));
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to switch network";
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
      
      if (typeof window !== "undefined") {
        localStorage.setItem("wallet_connection", JSON.stringify(updatedWallet));
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to refresh balance";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [wallet]);

  const loadPersistedConnection = useCallback(() => {
    if (typeof window === "undefined") return;

    try {
      const stored = localStorage.getItem("wallet_connection");
      if (stored) {
        const connection = JSON.parse(stored) as WalletConnection;
        if (connection.type === "custodial") {
          localStorage.removeItem("wallet_connection");
          return;
        }
        setWallet(connection);
        refreshBalance();
      }
    } catch (err) {
      console.error("Failed to load persisted wallet connection:", err);
      localStorage.removeItem("wallet_connection");
    }
  }, [refreshBalance]);

  return {
    wallet,
    connect,
    disconnect,
    switchNetwork,
    refreshBalance,
    isLoading,
    error,
    loadPersistedConnection,
  };
}
