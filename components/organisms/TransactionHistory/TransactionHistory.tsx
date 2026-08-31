'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ExternalLink,
  ArrowUpRight,
  ArrowDownLeft,
  UserPlus,
  ShieldPlus,
  Database,
  Code,
  Settings,
  AlertCircle,
  History,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/molecules/Card';
import { Text } from '@/components/atoms/Text';
import { Badge } from '@/components/atoms/Badge';
import { Button } from '@/components/atoms/Button';
import { useWalletContext } from '@/contexts/WalletContext';
import { cn } from '@/lib/utils';
import { fetchAccountTransactions, type ProcessedTransaction } from '@/lib/stellar/transactions';

export function TransactionHistory() {
  const { wallet } = useWalletContext();
  const [transactions, setTransactions] = useState<ProcessedTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTransactions = useCallback(async () => {
    if (!wallet?.publicKey) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchAccountTransactions(wallet.publicKey, wallet.network, 50);
      setTransactions(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load transactions';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [wallet?.publicKey, wallet?.network]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  if (!wallet?.isConnected) {
    return (
      <Card className="flex h-full flex-col justify-center items-center p-12 text-center bg-card/60 backdrop-blur-sm border-none shadow-sm rounded-3xl min-h-[500px]">
        <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-stellar-blue/10 text-stellar-blue mb-8 rotate-3 transition-transform hover:rotate-0 duration-500 shadow-inner">
          <History size={48} />
        </div>
        <CardTitle className="text-3xl font-black mb-4 tracking-tight">
          No Wallet Connected
        </CardTitle>
        <CardDescription className="max-w-md mx-auto text-lg text-muted-foreground/80 leading-relaxed font-medium">
          Connect your Stellar wallet to view your on-chain transaction history.
        </CardDescription>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="flex flex-col items-center justify-center p-12 text-center bg-card/60 backdrop-blur-sm border-none shadow-sm rounded-3xl min-h-[400px]">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20 text-red-600 mb-6 font-bold shadow-sm">
          <AlertCircle size={32} />
        </div>
        <CardTitle className="text-2xl font-black mb-2 tracking-tight text-red-600">
          Failed to Load Transactions
        </CardTitle>
        <CardDescription className="max-w-md mx-auto mb-6 text-muted-foreground/80 leading-relaxed font-medium">
          {error}
        </CardDescription>
        <Button stellar="accent" onClick={loadTransactions} disabled={isLoading}>
          Try Again
        </Button>
      </Card>
    );
  }

  if (isLoading) {
    return <TransactionHistorySkeleton />;
  }

  if (transactions.length === 0) {
    return (
      <Card className="flex h-full flex-col justify-center items-center p-12 text-center bg-card/60 backdrop-blur-sm border-none shadow-sm rounded-3xl min-h-[500px]">
        <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-stellar-blue/10 text-stellar-blue mb-8 rotate-3 transition-transform hover:rotate-0 duration-500 shadow-inner">
          <History size={48} />
        </div>
        <CardTitle className="text-3xl font-black mb-4 tracking-tight">
          No Transactions Yet
        </CardTitle>
        <CardDescription className="max-w-md mx-auto text-lg text-muted-foreground/80 leading-relaxed font-medium">
          Your on-chain activity will appear here once you make your first transaction.
        </CardDescription>
      </Card>
    );
  }

  return (
    <Card className="bg-card/60 backdrop-blur-sm border-none shadow-sm rounded-3xl">
      <CardHeader className="p-8 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-3xl font-black tracking-tight">
              Transaction History
            </CardTitle>
            <CardDescription className="text-base font-medium text-muted-foreground/70 mt-1">
              All on-chain activity for{' '}
              <span className="font-mono text-stellar-blue">
                {wallet.publicKey.slice(0, 6)}...{wallet.publicKey.slice(-4)}
              </span>
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadTransactions}
            disabled={isLoading}
            className="shrink-0"
          >
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-8 pt-2">
        <div className="space-y-1">
          {transactions.map((tx) => (
            <TransactionRow key={tx.id} tx={tx} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TransactionRow({ tx }: { tx: ProcessedTransaction }) {
  return (
    <div className="group flex items-start gap-4 rounded-2xl px-4 py-3 transition-colors hover:bg-muted/30">
      <div
        className={cn(
          'mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
          getOperationColor(tx.type, tx.isSent)
        )}
      >
        {getOperationIcon(tx.type, tx.isSent)}
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <Text className="text-sm font-semibold leading-none">{getOperationLabel(tx)}</Text>
            {!tx.successful && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                Failed
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{formatTimestamp(tx.createdAt)}</span>
            <span aria-hidden="true">&middot;</span>
            <span className="font-mono">
              {tx.transactionHash.slice(0, 8)}...{tx.transactionHash.slice(-6)}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {tx.amount && (
            <div className="text-right">
              <Text
                className={cn(
                  'text-sm font-bold tabular-nums leading-none',
                  tx.isSent ? 'text-red-400' : 'text-stellar-green'
                )}
              >
                {tx.isSent ? '-' : '+'}
                {parseFloat(tx.amount).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 7,
                })}
              </Text>
              {tx.assetCode && (
                <Text className="text-[11px] font-bold text-muted-foreground/60 uppercase tracking-wider block mt-0.5">
                  {tx.assetCode}
                </Text>
              )}
            </div>
          )}

          <a
            href={tx.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground/40 transition-colors hover:bg-muted/50 hover:text-stellar-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
            aria-label="View on Stellar Explorer"
          >
            <ExternalLink size={16} />
          </a>
        </div>
      </div>
    </div>
  );
}

function TransactionHistorySkeleton() {
  return (
    <Card className="bg-card/60 backdrop-blur-sm border-none shadow-sm rounded-3xl animate-pulse">
      <CardHeader className="p-8 pb-4">
        <div className="h-8 w-64 bg-muted/60 rounded mb-2" />
        <div className="h-4 w-48 bg-muted/40 rounded" />
      </CardHeader>
      <CardContent className="p-8 pt-2 space-y-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-start gap-4 rounded-2xl px-4 py-3">
            <div className="h-10 w-10 rounded-xl bg-muted/50 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="h-4 w-48 bg-muted/50 rounded mb-2" />
              <div className="h-3 w-36 bg-muted/30 rounded" />
            </div>
            <div className="shrink-0 text-right">
              <div className="h-4 w-20 bg-muted/50 rounded mb-1 ml-auto" />
              <div className="h-3 w-12 bg-muted/30 rounded ml-auto" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function getOperationIcon(type: string, isSent: boolean) {
  const size = 18;
  switch (type) {
    case 'payment':
    case 'path_payment':
    case 'path_payment_strict_receive':
    case 'path_payment_strict_send':
      return isSent ? <ArrowUpRight size={size} /> : <ArrowDownLeft size={size} />;
    case 'create_account':
      return <UserPlus size={size} />;
    case 'change_trust':
      return <ShieldPlus size={size} />;
    case 'manage_data':
      return <Database size={size} />;
    case 'invoke_host_function':
    case 'bump_footprint_expiration':
    case 'restore_footprint':
      return <Code size={size} />;
    case 'set_options':
    case 'manage_sell_offer':
    case 'manage_buy_offer':
      return <Settings size={size} />;
    default:
      return <Settings size={size} />;
  }
}

function getOperationColor(type: string, isSent: boolean) {
  switch (type) {
    case 'payment':
    case 'path_payment':
    case 'path_payment_strict_receive':
    case 'path_payment_strict_send':
      return isSent
        ? 'bg-red-100 dark:bg-red-900/20 text-red-500 dark:text-red-400'
        : 'bg-stellar-green/20 text-stellar-green';
    case 'create_account':
      return 'bg-stellar-blue/20 text-stellar-blue';
    case 'change_trust':
      return 'bg-stellar-purple/20 text-stellar-purple';
    case 'manage_data':
      return 'bg-stellar-cyan/20 text-stellar-cyan';
    case 'invoke_host_function':
    case 'bump_footprint_expiration':
    case 'restore_footprint':
      return 'bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400';
    default:
      return 'bg-muted/50 text-muted-foreground';
  }
}

function getOperationLabel(tx: ProcessedTransaction): string {
  const shortTo = tx.to ? `${tx.to.slice(0, 6)}...${tx.to.slice(-4)}` : '';
  const assetLabel = tx.assetCode ?? '';

  switch (tx.type) {
    case 'payment':
    case 'path_payment':
    case 'path_payment_strict_receive':
    case 'path_payment_strict_send':
      if (tx.isSent) return `Sent ${assetLabel}`;
      if (tx.from && tx.from !== tx.sourceAccount) {
        return `Received ${assetLabel}`;
      }
      return `Received ${assetLabel}`;
    case 'create_account':
      return `Created account ${shortTo}`;
    case 'change_trust':
      return `Added trust for ${assetLabel || 'unknown asset'}`;
    case 'manage_data':
      return `Set data entry`;
    case 'manage_sell_offer':
      return `Placed sell offer for ${assetLabel}`;
    case 'manage_buy_offer':
      return `Placed buy offer for ${assetLabel}`;
    case 'account_merge':
      return `Account merged`;
    case 'set_options':
      return `Changed account options`;
    case 'invoke_host_function':
      return `Contract call`;
    case 'bump_footprint_expiration':
      return `Extended storage footprint`;
    case 'restore_footprint':
      return `Restored storage footprint`;
    default:
      return tx.type
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
  }
}

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);

  if (diffInMinutes < 1) return 'Just now';
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  if (diffInHours < 24) return `${diffInHours}h ago`;
  if (diffInDays < 7) return `${diffInDays}d ago`;
  if (diffInDays < 30) return `${diffInDays}d ago`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
