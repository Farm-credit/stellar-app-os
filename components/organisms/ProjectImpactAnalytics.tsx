import React, { useState } from 'react';
import { TrendingUp, TreePine, Users, BarChart3 } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/molecules/Card';

// Local stub of the impact analytics domain. The public aggregation cache
// shape is owned by the planter-impact workstream; defining it locally here
// keeps this surface in lockstep with the component's render logic without
// pulling in additional files for a CI-only fix.
type AnalyticsTimeRange = '1M' | '6M' | '1Y' | 'ALL';

const RANGE_LABELS: Record<AnalyticsTimeRange, string> = {
  '1M': '1 Month',
  '6M': '6 Months',
  '1Y': '1 Year',
  ALL: 'All Time',
};

interface HistoricalPeriodMetrics {
  totalCO2Offset: number;
  totalTreesPlanted: number;
  activePlanters: number;
  survivalRate: number;
}

interface ProjectImpactData {
  stats: {
    totalCO2Offset: number;
    totalTreesPlanted: number;
    activePlanters: number;
    survivalRate: number;
  };
  historicalData: {
    lastMonth: HistoricalPeriodMetrics;
    lastSixMonths: HistoricalPeriodMetrics;
    lastYear: HistoricalPeriodMetrics;
  };
}

interface UseProjectImpactResult {
  data: ProjectImpactData | null;
  isLoading: boolean;
  error: string | null;
}

// Local stub hook. The real implementation lives in the planter-impact
// workstream; this intentionally returns `data: null` so the component
// shows a clear "not yet implemented" notice instead of fake zero metrics.
function useProjectImpact(_range: AnalyticsTimeRange): UseProjectImpactResult {
  // _range is part of the future API contract; intentionally unused for now.
  void _range;
  return { data: null, isLoading: false, error: null };
}

type CardConfig = {
  key: string;
  label: string;
  value: (data: ProjectImpactData) => number;
  subValue?: (data: ProjectImpactData) => string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  unit: string;
};
const CARDS_CONFIG: CardConfig[] = [
  {
    key: 'co2Offset',
    label: 'Total CO₂ Offset',
    value: (data: ProjectImpactData) => data.stats.totalCO2Offset,
    subValue: (data: ProjectImpactData) => {
      const lastMonth = data.historicalData.lastMonth.totalCO2Offset;
      const trend = lastMonth > 0 ? ((data.stats.totalCO2Offset - lastMonth) / lastMonth) * 100 : 0;
      return trend >= 0
        ? `+${trend.toFixed(1)}% from last month`
        : `${Math.abs(trend).toFixed(1)}% from last month`;
    },
    icon: TrendingUp,
    unit: 'tCO₂',
  },
  {
    key: 'treesPlanted',
    label: 'Total Trees Planted',
    value: (data: ProjectImpactData) => data.stats.totalTreesPlanted,
    subValue: (data: ProjectImpactData) => {
      const lastMonth = data.historicalData.lastMonth.totalTreesPlanted;
      const trend =
        lastMonth > 0 ? ((data.stats.totalTreesPlanted - lastMonth) / lastMonth) * 100 : 0;
      return trend >= 0
        ? `+${trend.toFixed(1)}% from last month`
        : `${Math.abs(trend).toFixed(1)}% from last month`;
    },
    icon: TreePine,
    unit: 'trees',
  },
  {
    key: 'activePlanters',
    label: 'Active Planters',
    value: (data: ProjectImpactData) => data.stats.activePlanters,
    subValue: (data: ProjectImpactData) => {
      const lastMonth = data.historicalData.lastMonth.activePlanters;
      const trend = lastMonth > 0 ? ((data.stats.activePlanters - lastMonth) / lastMonth) * 100 : 0;
      return trend >= 0
        ? `+${trend.toFixed(1)}% from last month`
        : `${Math.abs(trend).toFixed(1)}% from last month`;
    },
    icon: Users,
    unit: 'planters',
  },
  {
    key: 'survivalRate',
    label: 'Survival Rate',
    value: (data: ProjectImpactData) => data.stats.survivalRate,
    subValue: () => 'Above global average of 75%',
    icon: BarChart3,
    unit: '%',
  },
];

export default function ProjectImpactAnalytics() {
  const [range, setRange] = useState<AnalyticsTimeRange>('1M');
  const { data, isLoading, error } = useProjectImpact(range);

  const handleRangeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setRange(event.target.value as AnalyticsTimeRange);
  };

  const formatNumber = (value: number): string => {
    return new Intl.NumberFormat('en-US').format(value);
  };

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Project Impact Analytics
        </h1>
        <p className="text-muted-foreground">
          Real-time, project-wide impact statistics powered by the public aggregation cache.
        </p>
      </header>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label htmlFor="range-select" className="text-sm font-medium text-muted-foreground">
            Time Range:
          </label>
          <select
            id="range-select"
            value={range}
            onChange={handleRangeChange}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            {(Object.keys(RANGE_LABELS) as AnalyticsTimeRange[]).map((value) => (
              <option key={value} value={value}>
                {RANGE_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <Card key={index}>
              <CardHeader>
                <CardDescription>
                  <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                </CardDescription>
                <CardTitle>
                  <div className="mt-2 h-8 w-24 animate-pulse rounded bg-muted" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))
        ) : data ? (
          CARDS_CONFIG.map((card) => {
            const Icon = card.icon;
            const value = card.value(data);
            const subValue = card.subValue?.(data);

            return (
              <Card key={card.key}>
                <CardHeader>
                  <CardDescription className="flex items-center gap-2">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {card.label}
                  </CardDescription>
                  <CardTitle className="text-3xl">
                    {card.key === 'survivalRate'
                      ? value.toFixed(1)
                      : formatNumber(Math.round(value))}
                    <span className="ml-1 text-lg font-normal text-muted-foreground">
                      {card.unit}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{subValue}</p>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <div className="col-span-full">
            <Card>
              <CardHeader>
                <CardTitle>Impact metrics coming soon</CardTitle>
                <CardDescription>
                  Project Impact Analytics is wired up, but the public aggregation cache integration
                  is still being built by the planter-impact workstream. The dashboard will populate
                  automatically once that work lands.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        )}
      </div>

      {data && (
        <section className="mt-8 space-y-4">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Historical Performance
          </h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {(['lastMonth', 'lastSixMonths', 'lastYear'] as const).map((period) => {
              const isCurrentRange =
                (range === '1M' && period === 'lastMonth') ||
                (range === '6M' && (period === 'lastMonth' || period === 'lastSixMonths')) ||
                (range === '1Y' &&
                  (period === 'lastMonth' ||
                    period === 'lastSixMonths' ||
                    period === 'lastYear')) ||
                (range === 'ALL' && period === 'lastYear');

              return (
                <Card key={period} className={isCurrentRange ? 'ring-2 ring-primary' : ''}>
                  <CardHeader>
                    <CardTitle className="text-lg font-medium">
                      {period === 'lastMonth'
                        ? 'Last Month'
                        : period === 'lastSixMonths'
                          ? 'Last 6 Months'
                          : 'Last Year'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase">
                          CO₂ Offset
                        </p>
                        <p className="text-xl font-bold text-stellar-green">
                          {formatNumber(data.historicalData[period].totalCO2Offset)} tCO₂
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase">
                          Trees Planted
                        </p>
                        <p className="text-xl font-bold">
                          {formatNumber(data.historicalData[period].totalTreesPlanted)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase">
                          Active Planters
                        </p>
                        <p className="text-xl font-bold">
                          {formatNumber(data.historicalData[period].activePlanters)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground uppercase">
                          Survival Rate
                        </p>
                        <p className="text-xl font-bold">
                          {data.historicalData[period].survivalRate.toFixed(1)} %
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
