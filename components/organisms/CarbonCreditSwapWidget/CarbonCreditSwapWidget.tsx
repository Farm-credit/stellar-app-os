'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { ArrowLeftRight, Wallet, AlertCircle, Info, Leaf, Coins, Sun } from 'lucide-react';
import { useWalletContext } from '@/contexts/WalletContext';
import { useSwapQuote } from '@/hooks/useSwapQuote';
import { SlippageSettings } from '@/components/molecules/SlippageSettings/SlippageSettings';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/atoms/Skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/atoms/Badge';
import { Text } from '@/components/atoms/Text';
import { cn } from '@/lib/utils';
import type { DonationAsset } from '@/lib/types/donation-payment';
import type { WalletBalance } from '@/lib/types/wallet';

type AssetOption = {
  value: DonationAsset;
  label: string;
  symbol: string;
  icon: React.ReactNode;
};

const ASSET_OPTIONS: AssetOption[] = [
  { value: 'USDC', label: 'USDC', symbol: 'USDC', icon: <Coins className="h-4 w-4" /> },
  { value: 'USDT', label: 'USDT', symbol: 'USDT', icon: <Coins className="h-4 w-4" /> },
  { value: 'EURC', label: 'EURC', symbol: 'EURC', icon: <Coins className="h-4 w-4" /> },
  { value: 'XLM', label: 'XLM', symbol: 'XLM', icon: <Sun className="h-4 w-4" /> },
];

const OUTPUT_ASSET = {
  label: 'Carbon Credits',
  symbol: 'CARBON',
  icon: <Leaf className="h-4 w-4" />,
};

function formatBalance(balance: string): number {
  const num = parseFloat(balance);
  return isNaN(num) ? 0 : num;
}

function formatNumber(value: number, decimals: number = 4): string {
  if (value <= 0) return '0';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export interface CarbonCreditSwapWidgetProps {
  projectId?: string;
  className?: string;
  onPurchaseComplete?: (details: {
    inputAsset: DonationAsset;
    inputAmount: number;
    outputAmount: number;
    minimumReceived: number;
    slippageTolerance: number;
  }) => void;
}

export function CarbonCreditSwapWidget({
  className,
  onPurchaseComplete,
}: CarbonCreditSwapWidgetProps) {
  const { wallet, isLoading: walletLoading } = useWalletContext();
  const [inputAsset, setInputAsset] = useState<DonationAsset>('USDC');
  const [inputAmount, setInputAmount] = useState<string>('');
  const [slippageTolerance, setSlippageTolerance] = useState(0.01);
  const [txStatus, setTxStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [txError, setTxError] = useState<string | null>(null);

  const inputAmountNum = parseFloat(inputAmount);
  const isValidAmount = !isNaN(inputAmountNum) && inputAmountNum > 0;
  const isInvalidAmount = inputAmount.trim() !== '' && !isValidAmount;

  const balance = useMemo<WalletBalance>(() => {
    if (!wallet?.isConnected) {
      return { xlm: '0', usdc: '0', usdt: '0', eurc: '0' };
    }
    return wallet.balance;
  }, [wallet]);

  const walletBalanceKey =
    inputAsset === 'XLM' ? 'xlm' : (inputAsset.toLowerCase() as 'usdc' | 'usdt' | 'eurc');
  const availableBalance = formatBalance(balance[walletBalanceKey] ?? '0');
  const hasInsufficientBalance = isValidAmount && inputAmountNum > availableBalance;

  const quote = useSwapQuote({
    inputAsset,
    inputAmount: inputAmountNum,
    slippageTolerance,
    enabled: isValidAmount,
  });

  const canPurchase =
    wallet?.isConnected === true &&
    isValidAmount &&
    !hasInsufficientBalance &&
    !quote.loading &&
    txStatus !== 'submitting' &&
    txStatus !== 'error';

  const handleAssetSwitch = useCallback(() => {
    setInputAsset((prev) => (prev === 'USDC' ? 'XLM' : 'USDC'));
    setInputAmount('');
    setTxError(null);
  }, []);

  const handleAmountChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setInputAmount(value);
      setTxError(null);
    }
  }, []);

  const handlePurchase = useCallback(async () => {
    if (!wallet?.isConnected || !isValidAmount || hasInsufficientBalance) return;

    setTxStatus('submitting');
    setTxError(null);

    try {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      setTxStatus('idle');
      onPurchaseComplete?.({
        inputAsset,
        inputAmount: inputAmountNum,
        outputAmount: quote.outputAmount,
        minimumReceived: quote.minimumReceived,
        slippageTolerance,
      });
    } catch (err) {
      setTxStatus('error');
      setTxError(err instanceof Error ? err.message : 'Transaction failed');
    }
  }, [
    wallet,
    isValidAmount,
    hasInsufficientBalance,
    inputAsset,
    inputAmountNum,
    quote,
    slippageTolerance,
    onPurchaseComplete,
  ]);

  const handleMaxBalance = useCallback(() => {
    setInputAmount(availableBalance.toString());
  }, [availableBalance]);

  return (
    <Card className={cn('w-full max-w-md mx-auto', className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Leaf className="h-5 w-5 text-stellar-green" aria-hidden="true" />
          Buy Carbon Credits
        </CardTitle>
        <CardDescription>
          Purchase carbon credits using USDC or XLM with live slippage preview.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Wallet disconnected state */}
        {!wallet?.isConnected && (
          <div
            className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-700 dark:bg-amber-950"
            role="alert"
          >
            <Wallet className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <Text variant="small" as="span" className="text-amber-800 dark:text-amber-200">
              Connect your wallet to purchase carbon credits.
            </Text>
          </div>
        )}

        {/* Input Asset Selection */}
        <div className="space-y-2">
          <Label htmlFor="input-asset" className="text-sm font-medium">
            Payment Asset
          </Label>
          <div className="flex gap-2">
            <Select
              value={inputAsset}
              onValueChange={(val) => {
                setInputAsset(val as DonationAsset);
                setInputAmount('');
                setTxError(null);
              }}
              disabled={!wallet?.isConnected || txStatus === 'submitting'}
              aria-label="Select payment asset"
            >
              <SelectTrigger id="input-asset" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSET_OPTIONS.map((asset) => (
                  <SelectItem key={asset.value} value={asset.value}>
                    <span className="flex items-center gap-2">
                      {asset.icon}
                      {asset.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {wallet?.isConnected && (
              <div
                className="flex items-center gap-1 px-3 rounded-md border border-input bg-muted/50 text-sm"
                aria-live="polite"
              >
                <Text variant="small" as="span" className="text-muted-foreground">
                  Balance:
                </Text>
                <Text variant="small" as="span" className="font-medium">
                  {walletLoading ? (
                    <Skeleton className="w-12 h-4" />
                  ) : (
                    formatBalance(balance[walletBalanceKey] ?? '0').toFixed(2)
                  )}
                </Text>
                <Text variant="small" as="span" className="text-muted-foreground ml-1">
                  {inputAsset}
                </Text>
              </div>
            )}
          </div>
        </div>

        {/* Amount Input */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label htmlFor="amount-input" className="text-sm font-medium">
              Amount
            </Label>
            {wallet?.isConnected && (
              <button
                type="button"
                onClick={handleMaxBalance}
                disabled={!wallet?.isConnected || txStatus === 'submitting'}
                className="text-xs text-stellar-blue hover:underline focus-visible:outline-2 focus-visible:ring-2 focus-visible:ring-stellar-blue/50 rounded"
                aria-label={`Use maximum balance of ${formatBalance(balance[walletBalanceKey] ?? '0').toFixed(2)} ${inputAsset}`}
              >
                Max:{' '}
                {formatBalance(balance[walletBalanceKey] ?? '0').toFixed(2)}{' '}
                {inputAsset}
              </button>
            )}
          </div>
          <div className="relative">
            <Input
              id="amount-input"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={inputAmount}
              onChange={handleAmountChange}
              disabled={!wallet?.isConnected || txStatus === 'submitting'}
              aria-label="Enter amount to spend"
              aria-required="true"
              aria-invalid={isInvalidAmount}
              aria-describedby={
                isInvalidAmount
                  ? 'amount-error'
                  : hasInsufficientBalance
                    ? 'balance-error'
                    : undefined
              }
              className={cn(
                'pr-16',
                isInvalidAmount && 'border-destructive focus-visible:ring-destructive',
                hasInsufficientBalance && 'border-destructive focus-visible:ring-destructive'
              )}
            />
            <span
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none"
              aria-hidden="true"
            >
              {inputAsset}
            </span>
          </div>
          {isInvalidAmount && (
            <Text
              id="amount-error"
              variant="small"
              as="p"
              className="text-destructive"
              role="alert"
            >
              Please enter a valid positive amount
            </Text>
          )}
          {hasInsufficientBalance && (
            <Text
              id="balance-error"
              variant="small"
              as="p"
              className="text-destructive"
              role="alert"
            >
              Insufficient balance. You have{' '}
              {formatBalance(balance[walletBalanceKey] ?? '0').toFixed(2)}{' '}
              {inputAsset}.
            </Text>
          )}
        </div>

        {/* Swap/Asset Switch */}
        <div className="flex items-center justify-center">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleAssetSwitch}
            disabled={!wallet?.isConnected || txStatus === 'submitting'}
            aria-label="Switch payment asset between USDC and XLM"
            className="h-8 w-8 rounded-full border-2 border-border hover:border-stellar-blue hover:bg-stellar-blue/10 transition-colors"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Output Asset Display */}
        <div className="rounded-lg border border-stellar-blue/20 bg-stellar-blue/5 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <Text variant="small" as="span" className="font-medium text-muted-foreground">
              You will receive
            </Text>
            <Badge variant="outline" className="text-xs">
              {OUTPUT_ASSET.symbol}
            </Badge>
          </div>
          {quote.loading ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-24" />
            </div>
          ) : quote.error ? (
            <div className="flex items-center gap-2 text-destructive" role="alert">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <Text variant="small" as="span">
                {quote.error}
              </Text>
            </div>
          ) : (
            <>
              <Text variant="h3" as="span" className="font-bold text-stellar-blue">
                {formatNumber(quote.outputAmount, 6)} {OUTPUT_ASSET.symbol}
              </Text>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>
                  Rate: 1 {inputAsset} = {formatNumber(quote.exchangeRate, 2)} {OUTPUT_ASSET.symbol}
                </span>
                <span className="flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  Min received: {formatNumber(quote.minimumReceived, 6)} {OUTPUT_ASSET.symbol}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Price Impact */}
        {!quote.loading && !quote.error && quote.priceImpact > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Info className="h-3 w-3" />
            <span>Price impact: {(quote.priceImpact * 100).toFixed(2)}%</span>
          </div>
        )}

        {/* Slippage Settings */}
        <SlippageSettings
          value={slippageTolerance}
          onChange={setSlippageTolerance}
          disabled={txStatus === 'submitting'}
        />

        {/* Error state */}
        {txError && (
          <div
            className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
            <Text variant="small" as="span" className="text-destructive">
              {txError}
            </Text>
          </div>
        )}

        {/* Primary Action Button */}
        <Button
          type="button"
          variant="default"
          size="lg"
          onClick={handlePurchase}
          disabled={!canPurchase}
          className="w-full"
          aria-label={
            !wallet?.isConnected
              ? 'Connect wallet to buy carbon credits'
              : txStatus === 'submitting'
                ? 'Processing purchase'
                : 'Buy Carbon Credits'
          }
        >
          {txStatus === 'submitting' ? (
            <span className="flex items-center gap-2">
              <span
                className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"
                aria-hidden="true"
              />
              Processing...
            </span>
          ) : !wallet?.isConnected ? (
            'Connect Wallet'
          ) : hasInsufficientBalance ? (
            'Insufficient Balance'
          ) : (
            'Buy Carbon Credits'
          )}
        </Button>

        {/* Transaction status feedback */}
        {txStatus === 'submitting' && (
          <div className="text-center" aria-live="polite" aria-busy="true">
            <Text variant="small" as="p" className="text-muted-foreground">
              Submitting transaction to the Stellar network...
            </Text>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
