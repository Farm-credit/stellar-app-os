'use client';

import { useState, useRef, type ReactNode } from 'react';
import { AlertCircle, BarChart2, Download, RefreshCw, TrendingUp, Users } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Text } from '@/components/atoms/Text';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/molecules/Card';
import { cn } from '@/lib/utils';
import { useAnalyticsData } from '@/hooks/useAnalyticsData';
import { buildDefaultDateRange } from '@/lib/api/mock/analyticsData';
import type { AnalyticsChartType, AnalyticsDatePreset } from '@/lib/types/analytics';
import { exportChart } from './exportChart';
import { ChartRenderer } from './ChartRenderer';
import { AnalyticsSummaryCard } from './AnalyticsSummaryCard';

interface AnalyticsWidgetProps {
  title?: string;
  description?: string;
  className?: string;
}

const DATE_PRESETS: { label: string; days: number; preset: AnalyticsDatePreset }[] = [
  { label: '7d', days: 7, preset: '7d' },
  { label: '30d', days: 30, preset: '30d' },
  { label: '90d', days: 90, preset: '90d' },
];

const CHART_TABS: { type: AnalyticsChartType; label: string }[] = [
  { type: 'line', label: 'Line' },
  { type: 'bar', label: 'Bar' },
  { type: 'pie', label: 'Pie' },
  { type: 'donut', label: 'Donut' },
];

export function AnalyticsWidget({
  title = 'Platform Analytics',
  description = 'Real-time platform metrics.',
  className,
}: AnalyticsWidgetProps): ReactNode {
  const [activeChart, setActiveChart] = useState<AnalyticsChartType>('line');
  const chartContainerRef = useRef<HTMLDivElement | null>(null);

  const { dataset, isLoading, error, isLive, dateRange, setDateRange, refresh } =
    useAnalyticsData();

  const lastPoint = dataset?.timeSeries[dataset.timeSeries.length - 1];
  const totalUsers = dataset?.timeSeries.reduce((s, p) => s + p.users, 0) ?? 0;
  const totalTransactions = dataset?.timeSeries.reduce((s, p) => s + p.transactions, 0) ?? 0;
  const totalRevenue = dataset?.timeSeries.reduce((s, p) => s + p.revenue, 0) ?? 0;

  const handlePreset = (days: number) => {
    setDateRange(buildDefaultDateRange(days));
  };

  const handleFromChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDateRange({ ...dateRange, preset: 'custom', from: e.target.value });
  };

  const handleToChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDateRange({ ...dateRange, preset: 'custom', to: e.target.value });
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Page header */}
      <div>
        <Text as="h2" variant="h2" className="mb-1">
          {title}
        </Text>
        <Text variant="muted">{description}</Text>
      </div>

      {/* Main card */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">Overview</CardTitle>
              {isLive && (
                <span
                  className="inline-flex h-2 w-2 rounded-full bg-stellar-green"
                  aria-label="Live data feed active"
                  title="Live"
                />
              )}
            </div>
            <CardDescription className="sr-only">Analytics dashboard controls</CardDescription>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Date presets */}
              {DATE_PRESETS.map(({ label, days, preset }) => (
                <button
                  key={preset}
                  onClick={() => handlePreset(days)}
                  aria-pressed={dateRange.preset === preset}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    dateRange.preset === preset
                      ? 'bg-stellar-blue text-white'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  )}
                >
                  {label}
                </button>
              ))}

              {/* Custom date inputs */}
              <Input
                type="date"
                value={dateRange.from}
                onChange={handleFromChange}
                inputSize="sm"
                className="w-36"
                aria-label="From date"
              />
              <Input
                type="date"
                value={dateRange.to}
                onChange={handleToChange}
                inputSize="sm"
                className="w-36"
                aria-label="To date"
              />

              {/* Export buttons */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportChart(chartContainerRef, 'png')}
                aria-label="Export chart as PNG"
                className="gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                PNG
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportChart(chartContainerRef, 'svg')}
                aria-label="Export chart as SVG"
                className="gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                SVG
              </Button>

              {/* Refresh */}
              <Button
                variant="ghost"
                size="sm"
                onClick={refresh}
                aria-label="Refresh analytics data"
                className="gap-1.5"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Chart type tabs */}
          <div
            role="tablist"
            aria-label="Chart type"
            className="flex gap-1 rounded-lg bg-muted p-1"
          >
            {CHART_TABS.map(({ type, label }) => (
              <button
                key={type}
                role="tab"
                aria-selected={activeChart === type}
                onClick={() => setActiveChart(type)}
                className={cn(
                  'flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  activeChart === type
                    ? 'bg-background shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Error */}
          {error && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Chart area */}
          <div
            role="tabpanel"
            aria-label={`${activeChart} chart`}
            ref={chartContainerRef}
            className="relative min-h-80 rounded-lg"
          >
            {isLoading ? (
              <div className="flex h-80 items-center justify-center">
                <div
                  className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-stellar-blue"
                  aria-busy="true"
                >
                  <span className="sr-only">Loading chart data…</span>
                </div>
              </div>
            ) : dataset ? (
              <ChartRenderer activeChart={activeChart} dataset={dataset} />
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      {dataset && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <AnalyticsSummaryCard
            label="Total Users"
            value={totalUsers.toLocaleString()}
            icon={<Users className="h-4 w-4 text-stellar-blue" />}
          />
          <AnalyticsSummaryCard
            label="Total Transactions"
            value={totalTransactions.toLocaleString()}
            icon={<BarChart2 className="h-4 w-4 text-stellar-purple" />}
          />
          <AnalyticsSummaryCard
            label="Total Revenue"
            value={`$${totalRevenue.toLocaleString()}`}
            icon={<TrendingUp className="h-4 w-4 text-stellar-green" />}
          />
        </div>
      )}

      {/* Last updated */}
      {dataset && (
        <p className="text-right text-xs text-muted-foreground">
          Last updated:{' '}
          {new Date(dataset.lastUpdatedAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}
          {lastPoint && ` · Latest data: ${lastPoint.date}`}
        </p>
      )}
    </div>
  );
}
