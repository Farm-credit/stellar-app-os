'use client';

import React, { useCallback, useState, useEffect } from 'react';
import { Copy, LogOut, Loader2 } from 'lucide-react';
import { useWalletContext } from '@/contexts/WalletContext';
import { showToast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';

interface WalletBalanceProps {
  className?: string;
}

/**
 * Truncate wallet address to first and last 4 characters
 * Example: "GBUQWP3BOUZX34JSWAKB" -> "GBUU...AKBX"
 */
function truncateAddress(address: string): string {
  if (!address || address.length < 8) {
    return address;
  }
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/**
 * Format balance for display
 */
function formatBalance(balance: string): string {
  try {
    const num = parseFloat(balance);
    if (isNaN(num)) return '0.00';
    return num.toFixed(2);
  } catch {
    return '0.00';
  }
}

export function WalletBalance({ className }: WalletBalanceProps) {
  const { wallet, disconnect, isLoading, refreshBalance } = useWalletContext();
  const [isCopied, setIsCopied] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Refresh balance on visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && wallet?.isConnected) {
        setIsRefreshing(true);
        refreshBalance()
          .catch((err) => console.error('Failed to refresh balance:', err))
          .finally(() => setIsRefreshing(false));
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [wallet?.isConnected, refreshBalance]);

  const handleCopyAddress = useCallback(async () => {
    if (!wallet?.publicKey) return;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(wallet.publicKey);
      } else {
        // Fallback for HTTP or older browsers
        const textArea = document.createElement('textarea');
        textArea.value = wallet.publicKey;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }

      setIsCopied(true);
      showToast('Address copied to clipboard', 'success', 2000);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy address:', err);
      showToast('Failed to copy address', 'error', 3000);
    }
  }, [wallet?.publicKey]);

  const handleDisconnect = useCallback(() => {
    disconnect();
    showToast('Wallet disconnected', 'info', 2000);
  }, [disconnect]);

  const handleRefreshBalance = useCallback(async () => {
    if (isRefreshing || isLoading) return;

    setIsRefreshing(true);
    try {
      await refreshBalance();
      showToast('Balance updated', 'success', 2000);
    } catch (err) {
      console.error('Failed to refresh balance:', err);
      showToast('Failed to update balance', 'error', 3000);
    } finally {
      setIsRefreshing(false);
    }
  }, [isLoading, isRefreshing, refreshBalance]);

  if (!wallet?.isConnected) {
    return null;
  }

  const xlmBalance = formatBalance(wallet.balance.xlm);
  const usdcBalance = formatBalance(wallet.balance.usdc);

  return (
    <div
      className={cn(
        'flex flex-col rounded-lg border border-border bg-card p-4 shadow-sm',
        className
      )}
      role="region"
      aria-label="Wallet information and balance"
    >
      {/* Connection Status & Address */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          {/* Connection Indicator */}
          <div
            className="w-2 h-2 rounded-full bg-stellar-green flex-shrink-0"
            aria-label="Wallet connected"
            role="status"
          />

          {/* Truncated Address */}
          <Text
            variant="small"
            className="truncate font-mono text-foreground"
            title={wallet.publicKey}
          >
            {truncateAddress(wallet.publicKey)}
          </Text>
        </div>

        {/* Copy Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleCopyAddress}
          disabled={isCopied || isLoading}
          className="flex-shrink-0 h-8 w-8"
          title="Copy wallet address"
          aria-label={isCopied ? 'Address copied' : 'Copy address to clipboard'}
        >
          <Copy className={cn('h-4 w-4 transition-colors', isCopied && 'text-stellar-green')} />
        </Button>
      </div>

      {/* Network & Balance Display */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex-1">
          {/* Network Badge */}
          <div className="mb-3">
            <Text variant="small" className="text-muted-foreground mb-1">
              Network
            </Text>
            <div className="inline-block px-2 py-1 rounded-full bg-muted border border-border">
              <Text variant="small" className="capitalize font-medium text-xs">
                {wallet.network}
              </Text>
            </div>
          </div>

          {/* XLM Balance */}
          <div className="mb-3">
            <Text variant="small" className="text-muted-foreground mb-1">
              XLM
            </Text>
            <Text variant="h4" className="font-semibold text-stellar-blue">
              {xlmBalance}
              <span className="text-xs text-muted-foreground ml-1">XLM</span>
            </Text>
          </div>

          {/* USDC Balance */}
          <div>
            <Text variant="small" className="text-muted-foreground mb-1">
              USDC
            </Text>
            <Text variant="h4" className="font-semibold text-stellar-green">
              {usdcBalance}
              <span className="text-xs text-muted-foreground ml-1">USDC</span>
            </Text>
          </div>
        </div>

        {/* Refresh Button */}
        <Button
          variant="outline"
          size="icon"
          onClick={handleRefreshBalance}
          disabled={isRefreshing || isLoading}
          className="mt-6 h-9 w-9"
          title="Refresh balance"
          aria-label="Refresh wallet balance"
        >
          <Loader2 className={cn('h-4 w-4 transition-transform', isRefreshing && 'animate-spin')} />
        </Button>
      </div>

      {/* Disconnect Button */}
      <Button
        variant="destructive"
        size="sm"
        onClick={handleDisconnect}
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-2"
        aria-label="Disconnect wallet"
      >
        <LogOut className="h-4 w-4" />
        Disconnect
      </Button>
    </div>
  );
}

WalletBalance.displayName = 'WalletBalance';
