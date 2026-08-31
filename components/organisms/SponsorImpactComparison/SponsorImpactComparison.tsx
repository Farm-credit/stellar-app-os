'use client';

import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Minus, Trophy, Users, BarChart3 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Text } from '@/components/atoms/Text';
import { Skeleton } from '@/components/atoms/Skeleton';
import { useGlobalSponsorStats } from '@/hooks/useGlobalSponsorStats';
import { computePercentileRank } from '@/lib/api/carbon-impact';

interface SponsorImpactComparisonProps {
  sponsorCo2OffsetKg: number;
  sponsorTreeCount?: number;
  isLoading?: boolean;
}

function PercentileBadge({ percentile }: { percentile: number }) {
  if (percentile <= 10) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
        <Trophy className="h-3.5 w-3.5" />
        Top {percentile}%
      </div>
    );
  }
  if (percentile <= 25) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
        <TrendingUp className="h-3.5 w-3.5" />
        Top {percentile}%
      </div>
    );
  }
  if (percentile <= 50) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-sm font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
        <BarChart3 className="h-3.5 w-3.5" />
        Top {percentile}%
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
      <Users className="h-3.5 w-3.5" />
      Top {percentile}%
    </div>
  );
}

function ComparisonBar({
  label,
  value,
  maxValue,
  color,
  isLoading,
}: {
  label: string;
  value: number;
  maxValue: number;
  color: string;
  isLoading: boolean;
}) {
  const percentage = maxValue > 0 ? Math.min((value / maxValue) * 100, 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Text variant="small" className="text-sm font-semibold text-muted-foreground">
          {label}
        </Text>
        <Text variant="small" className="text-sm font-bold">
          {isLoading ? '—' : `${value.toLocaleString()} kg`}
        </Text>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        {isLoading ? (
          <Skeleton className="h-full w-full" />
        ) : (
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${percentage}%`,
              background: color,
            }}
          />
        )}
      </div>
    </div>
  );
}

function TrendIndicator({ difference }: { difference: number }) {
  if (difference > 0) {
    return (
      <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
        <TrendingUp className="h-4 w-4" />
        <span className="text-sm font-bold">+{difference.toFixed(1)}%</span>
      </div>
    );
  }
  if (difference < 0) {
    return (
      <div className="flex items-center gap-1 text-red-500 dark:text-red-400">
        <TrendingDown className="h-4 w-4" />
        <span className="text-sm font-bold">{difference.toFixed(1)}%</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 text-slate-500">
      <Minus className="h-4 w-4" />
      <span className="text-sm font-bold">0%</span>
    </div>
  );
}

export function SponsorImpactComparison({
  sponsorCo2OffsetKg,
  sponsorTreeCount = 0,
  isLoading = false,
}: SponsorImpactComparisonProps) {
  const { stats, isLoading: statsLoading, lastUpdated } = useGlobalSponsorStats();

  const loading = isLoading || statsLoading;

  const comparison = useMemo(() => {
    if (!stats) {
      return {
        percentile: 0,
        vsAverage: 0,
        vsMedian: 0,
        maxBarValue: 0,
      };
    }

    const percentile = computePercentileRank(sponsorCo2OffsetKg, stats.topPercentiles);
    const vsAverage =
      stats.averageCo2OffsetKg > 0
        ? ((sponsorCo2OffsetKg - stats.averageCo2OffsetKg) / stats.averageCo2OffsetKg) * 100
        : 0;
    const vsMedian =
      stats.medianCo2OffsetKg > 0
        ? ((sponsorCo2OffsetKg - stats.medianCo2OffsetKg) / stats.medianCo2OffsetKg) * 100
        : 0;
    const maxBarValue = Math.max(sponsorCo2OffsetKg, stats.averageCo2OffsetKg) * 1.2;

    return { percentile, vsAverage, vsMedian, maxBarValue };
  }, [sponsorCo2OffsetKg, stats]);

  return (
    <Card className="overflow-hidden border-transparent bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950/20 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-bold">Impact Comparison</CardTitle>
            <CardDescription>
              See how your CO₂ offset compares to other sponsors on the platform
            </CardDescription>
          </div>
          {lastUpdated && (
            <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
              Updated {timeAgo(lastUpdated)}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Percentile Rank */}
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-white/80 dark:bg-slate-900/80 p-6 shadow-sm">
          <Text
            variant="small"
            className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
          >
            Your Ranking
          </Text>
          {loading ? (
            <Skeleton className="h-8 w-32" />
          ) : (
            <PercentileBadge percentile={comparison.percentile} />
          )}
          <Text variant="muted" className="text-center text-sm">
            You rank in the top {comparison.percentile}% of all{' '}
            {stats?.totalSponsors.toLocaleString()} sponsors
          </Text>
        </div>

        {/* Comparison Bars */}
        <div className="space-y-4">
          <ComparisonBar
            label="Your CO₂ Offset"
            value={sponsorCo2OffsetKg}
            maxValue={comparison.maxBarValue}
            color="#14b8a6"
            isLoading={loading}
          />
          <ComparisonBar
            label="Platform Average"
            value={stats?.averageCo2OffsetKg ?? 0}
            maxValue={comparison.maxBarValue}
            color="#94a3b8"
            isLoading={loading}
          />
          <ComparisonBar
            label="Platform Median"
            value={stats?.medianCo2OffsetKg ?? 0}
            maxValue={comparison.maxBarValue}
            color="#cbd5e1"
            isLoading={loading}
          />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-2xl bg-white/80 dark:bg-slate-900/80 p-4 shadow-sm">
            <Text
              variant="small"
              className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
            >
              vs Average
            </Text>
            <div className="mt-2 flex items-center gap-2">
              {loading ? (
                <Skeleton className="h-6 w-20" />
              ) : (
                <TrendIndicator difference={comparison.vsAverage} />
              )}
            </div>
          </div>
          <div className="rounded-2xl bg-white/80 dark:bg-slate-900/80 p-4 shadow-sm">
            <Text
              variant="small"
              className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
            >
              vs Median
            </Text>
            <div className="mt-2 flex items-center gap-2">
              {loading ? (
                <Skeleton className="h-6 w-20" />
              ) : (
                <TrendIndicator difference={comparison.vsMedian} />
              )}
            </div>
          </div>
        </div>

        {/* Summary */}
        {!loading && stats && (
          <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 p-4 text-center">
            <Text variant="muted" className="text-sm">
              {sponsorCo2OffsetKg >= stats.averageCo2OffsetKg
                ? `You're offsetting ${Math.abs(comparison.vsAverage).toFixed(0)}% more CO₂ than the average sponsor across your ${sponsorTreeCount} tree${sponsorTreeCount !== 1 ? 's' : ''}! Keep up the great work.`
                : `You're ${Math.abs(comparison.vsAverage).toFixed(0)}% below the platform average with ${sponsorTreeCount} tree${sponsorTreeCount !== 1 ? 's' : ''}. Consider sponsoring more trees to increase your impact.`}
            </Text>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString();
}
