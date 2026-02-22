"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/atoms/Button";
import { Badge } from "@/components/atoms/Badge";
import { Text } from "@/components/atoms/Text";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/molecules/Card";
import { useWalletContext } from "@/contexts/WalletContext";
import { isFreighterInstalled, formatBalance } from "@/lib/stellar/wallet";
import type { WalletType, NetworkType, WalletConnectionProps } from "@/lib/types/wallet";

const FREIGHTER_INSTALL_URL = "https://freighter.app";

export function WalletConnectionStep({ onConnectionChange }: WalletConnectionProps) {
  const {
    wallet,
    connect,
    disconnect,
    switchNetwork,
    refreshBalance,
    isLoading,
    error,
  } = useWalletContext();

  const [connectingType, setConnectingType] = useState<WalletType | null>(null);
  const [freighterAvailable, setFreighterAvailable] = useState(false);

  useEffect(() => {
    isFreighterInstalled().then(setFreighterAvailable).catch(() => setFreighterAvailable(false));
  }, []);

  useEffect(() => {
    if (onConnectionChange) {
      onConnectionChange(wallet);
    }
  }, [wallet]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnect = async (type: WalletType) => {
    setConnectingType(type);
    try {
      await connect(type, wallet?.network || "testnet");
    } catch (err) {
      console.error("Connection error:", err);
    } finally {
      setConnectingType(null);
    }
  };

  const handleDisconnect = () => {
    disconnect();
  };

  const handleNetworkSwitch = async (network: NetworkType) => {
    if (!wallet) return;
    try {
      await switchNetwork(network);
    } catch (err) {
      console.error("Network switch error:", err);
    }
  };

  const handleRefreshBalance = async () => {
    await refreshBalance();
  };

  if (wallet?.isConnected) {
    return (
      <div className="space-y-6">
        <div>
          <Text variant="h3" as="h2" className="mb-2">
            Wallet Connected
          </Text>
          <Text variant="muted" as="p">
            Your wallet is connected and ready for transactions.
          </Text>
        </div>

        {wallet.network === "testnet" && (
          <div className="rounded-lg border-2 border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 p-4">
            <div className="flex items-center gap-2">
              <svg
                className="h-5 w-5 text-yellow-600 dark:text-yellow-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <Text variant="small" as="span" className="font-semibold text-yellow-800 dark:text-yellow-200">
                Testnet Mode
              </Text>
            </div>
            <Text variant="small" as="p" className="mt-1 text-yellow-700 dark:text-yellow-300">
              You are connected to Stellar Testnet. This is for testing purposes only.
            </Text>
          </div>
        )}

        <Card className="border-stellar-blue/30">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Badge variant="success" className="capitalize">
                    {wallet.type}
                  </Badge>
                  <span className="text-sm font-mono text-muted-foreground">
                    {wallet.publicKey.slice(0, 8)}...{wallet.publicKey.slice(-8)}
                  </span>
                </CardTitle>
                <div className="mt-2 text-sm text-muted-foreground">
                  Network:{" "}
                  <Badge variant={wallet.network === "mainnet" ? "default" : "outline"}>
                    {wallet.network}
                  </Badge>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                aria-label="Disconnect wallet"
              >
                Disconnect
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Text variant="small" as="span" className="font-semibold">
                  Balances
                </Text>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRefreshBalance}
                  disabled={isLoading}
                  aria-label="Refresh balance"
                >
                  Refresh
                </Button>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <Text variant="small" as="span">XLM</Text>
                  <Text variant="small" as="span" className="font-mono font-semibold">
                    {formatBalance(wallet.balance.xlm)}
                  </Text>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <Text variant="small" as="span">USDC</Text>
                  <Text variant="small" as="span" className="font-mono font-semibold">
                    {formatBalance(wallet.balance.usdc)}
                  </Text>
                </div>
              </div>
            </div>

            <div>
              <Text variant="small" as="span" className="font-semibold block mb-2">
                Network
              </Text>
              <div className="flex gap-2">
                <Button
                  variant={wallet.network === "testnet" ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleNetworkSwitch("testnet")}
                  disabled={isLoading || wallet.network === "testnet"}
                  aria-label="Switch to testnet"
                >
                  Testnet
                </Button>
                <Button
                  variant={wallet.network === "mainnet" ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleNetworkSwitch("mainnet")}
                  disabled={isLoading || wallet.network === "mainnet"}
                  aria-label="Switch to mainnet"
                >
                  Mainnet
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Text variant="h3" as="h2" className="mb-2">
          Connect Your Wallet
        </Text>
        <Text variant="muted" as="p">
          Choose a wallet to connect and start purchasing carbon credits.
        </Text>
      </div>

      {error && (
        <div
          className="rounded-lg border border-destructive bg-destructive/10 p-4"
          role="alert"
        >
          <Text variant="small" as="p" className="text-destructive">
            {error}
          </Text>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-stellar-purple/30 hover:border-stellar-purple/50 transition-colors">
          <CardHeader>
            <CardTitle className="text-lg">Freighter</CardTitle>
            <CardDescription>
              Browser extension wallet for Stellar
            </CardDescription>
          </CardHeader>
          <CardContent>
            {freighterAvailable ? (
              <Button
                stellar="accent"
                className="w-full"
                onClick={() => handleConnect("freighter")}
                disabled={isLoading || connectingType !== null}
                aria-label="Connect Freighter wallet"
              >
                {connectingType === "freighter" ? "Connecting..." : "Connect Freighter"}
              </Button>
            ) : (
              <div className="space-y-2">
                <Button
                  stellar="accent"
                  className="w-full"
                  onClick={() => window.open(FREIGHTER_INSTALL_URL, "_blank")}
                  aria-label="Install Freighter wallet"
                >
                  Install Freighter
                </Button>
                <Text variant="muted" as="p" className="text-xs text-center">
                  Freighter extension not detected
                </Text>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-stellar-purple/30 hover:border-stellar-purple/50 transition-colors">
          <CardHeader>
            <CardTitle className="text-lg">Albedo</CardTitle>
            <CardDescription>
              Web-based wallet for Stellar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              stellar="accent"
              className="w-full"
              onClick={() => handleConnect("albedo")}
              disabled={isLoading || connectingType !== null}
              aria-label="Connect Albedo wallet"
            >
              {connectingType === "albedo" ? "Connecting..." : "Connect Albedo"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
