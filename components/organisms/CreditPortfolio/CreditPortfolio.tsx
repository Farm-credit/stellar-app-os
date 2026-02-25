'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TrendingUp, RefreshCw, AlertCircle, Wallet } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/molecules/Card';
import { CreditRow } from '@/components/molecules/CreditRow';
import { useCreditPortfolio } from '@/hooks/useCreditPortfolio';
import { useWalletContext } from '@/contexts/WalletContext';
import type { CreditHolding } from '@/lib/types/credits';
import { cn } from '@/lib/utils';

export function CreditPortfolio() {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    // This pattern is intentional for proper SSR hydration in Next.js
    // It's necessary to defer rendering until the client side
    setIsClient(true);
  }, []);

  // Defer the entire component until we're on the client
  if (!isClient) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-stellar-blue/30 bg-stellar-blue/5 px-6 py-12 text-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-stellar-blue/30 border-t-stellar-blue" />
      </div>
    );
  }

  return <CreditPortfolioContent />;
}

function CreditPortfolioContent() {
  const { wallet } = useWalletContext();
  const { credits, stats, isLoading, error, refreshPortfolio } = useCreditPortfolio(
    wallet?.publicKey || null
  );
  const router = useRouter();

  const handleTrade = useCallback(
    (credit: CreditHolding) => {
      router.push(`/credits/marketplace?project=${credit.projectId}&quantity=${credit.quantity}`);
    },
    [router]
  );

  const handleRetire = useCallback(
    (credit: CreditHolding) => {
      router.push(`/dashboard/retire?projectId=${credit.projectId}&quantity=${credit.quantity}`);
    },
    [router]
  );

  if (!wallet?.isConnected) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-stellar-blue/30 bg-stellar-blue/5 px-6 py-12 text-center">
        <Wallet className="mb-4 h-12 w-12 text-stellar-blue" aria-hidden="true" />
        <Text variant="h4" as="p" className="mb-2 font-semibold">
          Wallet Not Connected
        </Text>
        <Text variant="small" as="p" className="mb-6 text-muted-foreground">
          Connect your Stellar wallet to view your carbon credit portfolio.
        </Text>
        <Button stellar="primary">Connect Wallet</Button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-900/20">
        <div className="flex items-start gap-3">
          <AlertCircle
            className="mt-0.5 h-5 w-5 text-red-600 dark:text-red-400"
            aria-hidden="true"
          />
          <div>
            <Text variant="body" as="p" className="font-semibold text-red-800 dark:text-red-200">
              Failed to Load Portfolio
            </Text>
            <Text variant="small" as="p" className="mt-1 text-red-700 dark:text-red-300">
              {error}
            </Text>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Portfolio Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Credits"
          value={`${stats.totalCredits.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} tons`}
          icon={<TrendingUp className="h-5 w-5 text-stellar-blue" />}
          loading={isLoading}
        />
        <StatCard
          label="Portfolio Value"
          value={`$${stats.totalValue.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
          icon={<TrendingUp className="h-5 w-5 text-stellar-green" />}
          loading={isLoading}
        />
        <StatCard
          label="Active Credits"
          value={`${stats.activeCredits}`}
          variant="accent"
          loading={isLoading}
        />
        <StatCard
          label="Retired Credits"
          value={`${stats.retiredCredits}`}
          variant="muted"
          loading={isLoading}
        />
      </div>

      {/* Credits List */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Your Carbon Credits</CardTitle>
            <CardDescription>Manage your portfolio of verified carbon credits</CardDescription>
          </div>
          <Button
            stellar="primary"
            size="sm"
            onClick={refreshPortfolio}
            disabled={isLoading}
            className="w-full gap-2 sm:w-auto"
          >
            <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} aria-hidden="true" />
            Refresh
          </Button>
        </CardHeader>

        <CardContent>
          {isLoading && credits.length === 0 ? (
            <div className="flex justify-center py-12">
              <div className="space-y-2 text-center">
                <div className="inline-flex h-12 w-12 animate-spin items-center justify-center rounded-full border-4 border-stellar-blue/20 border-t-stellar-blue">
                  <span className="sr-only">Loading...</span>
                </div>
                <Text variant="small" as="p" className="text-muted-foreground">
                  Loading portfolio...
                </Text>
              </div>
            </div>
          ) : credits.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Wallet className="mb-3 h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
              <Text variant="body" as="p" className="mb-1 font-semibold">
                No Carbon Credits Found
              </Text>
              <Text variant="small" as="p" className="mb-4 text-muted-foreground">
                Your portfolio is empty. Purchase carbon credits to get started.
              </Text>
              <Button stellar="primary" asChild>
                <a href="/credits/purchase">Buy Carbon Credits</a>
              </Button>
            </div>
          ) : (
            <div className="space-y-0">
              {credits.map((credit) => (
                <CreditRow
                  key={`${credit.projectId}-${credit.vintage}-${credit.status}`}
                  credit={credit}
                  onTrade={handleTrade}
                  onRetire={handleRetire}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Last Updated Info */}
      {stats.lastUpdated > 0 && (
        <Text variant="small" as="p" className="text-right text-muted-foreground">
          Last updated: {new Date(stats.lastUpdated).toLocaleTimeString()}
        </Text>
      )}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'accent' | 'muted';
  loading?: boolean;
}

function StatCard({ label, value, icon, variant = 'default', loading }: StatCardProps) {
  const bgStyles = {
    default: 'bg-stellar-blue/5 dark:bg-stellar-blue/10',
    accent: 'bg-stellar-purple/5 dark:bg-stellar-purple/10',
    muted: 'bg-muted dark:bg-muted/50',
  };

  return (
    <Card className={cn('overflow-hidden', bgStyles[variant])}>
      <CardContent className="p-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {icon && <div className="opacity-70">{icon}</div>}
            <Text variant="small" as="p" className="text-muted-foreground">
              {label}
            </Text>
          </div>
          <Text
            variant="h4"
            as="p"
            className={cn('font-semibold', loading && 'animate-pulse text-muted-foreground')}
          >
            {loading ? '—' : value}
          </Text>
        </div>
      </CardContent>
    </Card>
  );
}
