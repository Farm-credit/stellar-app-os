'use client';

/**
 * TokenBalances — live token balance surface for the connected wallet.
 *
 * Shows XLM + USDC balances that auto-poll (via `useTokenBalances`), a manual refresh
 * control, a "live" indicator so the polling is visible, and a button that opens the
 * accessible `TransactionHistoryModal`. Handles not-connected / loading / error /
 * populated states and is responsive across mobile → desktop.
 */

import { useState } from 'react';
import { Coins, History, RefreshCw, AlertCircle, Wallet } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/molecules/Card';
import { Text } from '@/components/atoms/Text';
import { Button } from '@/components/atoms/Button';
import { cn } from '@/lib/utils';
import { useTokenBalances } from '@/hooks/useTokenBalances';
import { TransactionHistoryModal } from '@/components/organisms/TransactionHistoryModal/TransactionHistoryModal';

interface TokenBalancesProps {
  className?: string;
}

/** Format a raw stringified balance for display (2–7 fraction digits). */
function formatBalance(balance: string): string {
  const num = parseFloat(balance);
  if (isNaN(num)) return '0.00';
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 7,
  });
}

export function TokenBalances({ className }: TokenBalancesProps) {
  const { balance, isLoading, isFetching, isError, error, refetch, isConnected } =
    useTokenBalances();
  const [historyOpen, setHistoryOpen] = useState(false);

  if (!isConnected) {
    return (
      <Card
        className={cn(
          'flex flex-col items-center justify-center rounded-3xl border-none bg-card/60 p-12 text-center shadow-sm backdrop-blur-sm min-h-[320px]',
          className
        )}
        role="region"
        aria-label="Token balances"
      >
        <div className="mb-8 flex h-24 w-24 items-center justify-center rounded-3xl bg-stellar-blue/10 text-stellar-blue shadow-inner">
          <Wallet size={48} />
        </div>
        <CardTitle className="mb-4 text-3xl font-black tracking-tight">
          No Wallet Connected
        </CardTitle>
        <CardDescription className="mx-auto max-w-md text-lg font-medium leading-relaxed text-muted-foreground/80">
          Connect your Stellar wallet to view your token balances.
        </CardDescription>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card
        className={cn(
          'flex flex-col items-center justify-center rounded-3xl border-none bg-card/60 p-12 text-center shadow-sm backdrop-blur-sm min-h-[320px]',
          className
        )}
        role="region"
        aria-label="Token balances"
      >
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600 shadow-sm dark:bg-red-900/20">
          <AlertCircle size={32} />
        </div>
        <CardTitle className="mb-2 text-2xl font-black tracking-tight text-red-600">
          Failed to Load Balances
        </CardTitle>
        <CardDescription className="mx-auto mb-6 max-w-md font-medium leading-relaxed text-muted-foreground/80">
          {error?.message ?? 'Something went wrong while fetching your balances.'}
        </CardDescription>
        <Button stellar="accent" onClick={refetch} disabled={isFetching}>
          Try Again
        </Button>
      </Card>
    );
  }

  return (
    <Card
      className={cn('rounded-3xl border-none bg-card/60 shadow-sm backdrop-blur-sm', className)}
      role="region"
      aria-label="Token balances"
    >
      <CardHeader className="p-8 pb-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-3xl font-black tracking-tight">
              <Coins className="text-stellar-blue" size={28} aria-hidden="true" />
              Token Balances
            </CardTitle>
            <CardDescription className="mt-1 flex items-center gap-2 text-base font-medium text-muted-foreground/70">
              <span
                className={cn(
                  'inline-block h-2 w-2 rounded-full bg-stellar-green',
                  isFetching && 'animate-pulse'
                )}
                aria-hidden="true"
              />
              <span>{isFetching ? 'Updating…' : 'Live'}</span>
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={refetch}
            disabled={isFetching}
            className="h-9 w-9 shrink-0"
            title="Refresh balances"
            aria-label="Refresh balances"
          >
            <RefreshCw
              className={cn('h-4 w-4 transition-transform', isFetching && 'animate-spin')}
            />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 p-8 pt-2">
        {isLoading ? (
          <TokenBalancesSkeleton />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <BalanceTile
              label="XLM"
              value={formatBalance(balance.xlm)}
              accentClass="text-stellar-blue"
              tileClass="bg-stellar-blue/10"
            />
            <BalanceTile
              label="USDC"
              value={formatBalance(balance.usdc)}
              accentClass="text-stellar-green"
              tileClass="bg-stellar-green/10"
            />
          </div>
        )}

        <Button
          stellar="primary"
          width="full"
          onClick={() => setHistoryOpen(true)}
          className="flex items-center justify-center gap-2"
        >
          <History className="h-4 w-4" aria-hidden="true" />
          Transaction History
        </Button>
      </CardContent>

      <TransactionHistoryModal open={historyOpen} onOpenChange={setHistoryOpen} />
    </Card>
  );
}

function BalanceTile({
  label,
  value,
  accentClass,
  tileClass,
}: {
  label: string;
  value: string;
  accentClass: string;
  tileClass: string;
}) {
  return (
    <div
      className={cn('rounded-2xl p-5 transition-colors', tileClass)}
      role="group"
      aria-label={`${label} balance`}
    >
      <Text variant="label" className="mb-1 text-muted-foreground">
        {label}
      </Text>
      <div className="flex items-baseline gap-1.5">
        <Text
          as="span"
          className={cn('text-2xl font-black tabular-nums leading-none', accentClass)}
        >
          {value}
        </Text>
        <Text
          as="span"
          className="text-xs font-bold uppercase tracking-wider text-muted-foreground/60"
        >
          {label}
        </Text>
      </div>
    </div>
  );
}

function TokenBalancesSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-hidden="true">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-2xl bg-muted/40 p-5">
          <div className="mb-3 h-3 w-12 rounded bg-muted/60" />
          <div className="h-6 w-24 rounded bg-muted/60" />
        </div>
      ))}
    </div>
  );
}

TokenBalances.displayName = 'TokenBalances';
