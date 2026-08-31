'use client';

import { useEffect, useMemo, useState } from 'react';
import { CarbonChart } from './CarbonChart';
import { BadgesList, type BadgeItem } from './BadgesList';
import { SocialShareCard } from './SocialShareCard';
import { CarbonCreditSwapWidget } from '@/components/organisms/CarbonCreditSwapWidget';
import { Counter } from '@/components/atoms/Counter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshCw, Sparkles, TreePine, Wind } from 'lucide-react';

interface CarbonDataPoint {
  date: string;
  offset_kg: number;
}

type CarbonRange = '7d' | '30d' | 'all';

interface CarbonDashboardStats {
  totalTrees: number;
  totalOffsetKg: number;
  avgOffsetPerTree: number;
  contributorCount: number;
  data: CarbonDataPoint[];
}

const mockCarbonData: CarbonDataPoint[] = [
  { date: '2024-01-01', offset_kg: 42 },
  { date: '2024-02-01', offset_kg: 50 },
  { date: '2024-03-01', offset_kg: 58 },
  { date: '2024-04-01', offset_kg: 72 },
  { date: '2024-05-01', offset_kg: 86 },
  { date: '2024-06-01', offset_kg: 95 },
  { date: '2024-07-01', offset_kg: 118 },
  { date: '2024-08-01', offset_kg: 132 },
];

const mockBadges: BadgeItem[] = [
  {
    id: 'b1',
    name: 'First Seed',
    description: 'Sponsored your very first tree on the platform.',
    iconType: 'seed',
    achieved: true,
  },
  {
    id: 'b2',
    name: 'Green Thumb',
    description: 'Sponsored 10 trees in a single month.',
    iconType: 'tree',
    achieved: true,
  },
  {
    id: 'b3',
    name: 'Forest Guardian',
    description: 'Reach a total of 100 trees sponsored.',
    iconType: 'forest',
    achieved: false,
  },
  {
    id: 'b4',
    name: 'Carbon Champion',
    description: 'Offset 1,000kg of CO2 across all your trees.',
    iconType: 'champion',
    achieved: false,
  },
];

const rangeOptions: Array<{ value: CarbonRange; label: string }> = [
  { value: '7d', label: '1 Week' },
  { value: '30d', label: '1 Month' },
  { value: 'all', label: 'All Time' },
];

const tabPanelId = 'carbon-dashboard-panel';

const rangeData: Record<CarbonRange, CarbonDashboardStats> = {
  '7d': {
    totalTrees: 8,
    totalOffsetKg: 324,
    avgOffsetPerTree: 40,
    contributorCount: 4,
    data: mockCarbonData.slice(-2),
  },
  '30d': {
    totalTrees: 16,
    totalOffsetKg: 612,
    avgOffsetPerTree: 38,
    contributorCount: 12,
    data: mockCarbonData.slice(-4),
  },
  all: {
    totalTrees: 28,
    totalOffsetKg: mockCarbonData.reduce((acc, point) => acc + point.offset_kg, 0),
    avgOffsetPerTree: Math.round(
      mockCarbonData.reduce((acc, point) => acc + point.offset_kg, 0) / 28
    ),
    contributorCount: 24,
    data: mockCarbonData,
  },
};

function getCarbonDashboardStats(range: CarbonRange): Promise<CarbonDashboardStats> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(rangeData[range]);
    }, 750);
  });
}

function StatCard({
  label,
  value,
  prefix,
  suffix,
  description,
  icon,
  loading,
}: {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  description: string;
  icon: React.ReactNode;
  loading: boolean;
}) {
  return (
    <Card className="group overflow-hidden border-transparent transition-shadow hover:shadow-lg focus-within:shadow-lg">
      <CardHeader className="flex items-center justify-between gap-3">
        <div>
          <CardTitle className="text-sm font-medium">{label}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <div className="rounded-2xl bg-slate-100 p-2 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            <div className="h-12 w-32 rounded-xl bg-muted animate-pulse" />
            <div className="h-4 w-24 rounded-full bg-muted animate-pulse" />
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <Counter
              end={value}
              prefix={prefix ?? ''}
              suffix={suffix ?? ''}
              className="text-4xl font-black tracking-tight"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">Live accumulation counter</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function CarbonDashboard() {
  const [selectedRange, setSelectedRange] = useState<CarbonRange>('all');
  const [dashboardData, setDashboardData] = useState<CarbonDashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const canRefresh = !isLoading;

  const loadData = async (range: CarbonRange) => {
    setIsLoading(true);
    setError(null);

    try {
      const stats = await getCarbonDashboardStats(range);
      setDashboardData(stats);
    } catch {
      setError('Failed to load carbon dashboard data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData(selectedRange);
  }, [selectedRange]);

  useEffect(() => {
    if (!dashboardData) return;

    const interval = window.setInterval(() => {
      setDashboardData((current) => {
        if (!current) return current;

        const lastPoint = current.data[current.data.length - 1];
        const delta = 4;

        const updatedData = [
          ...current.data.slice(0, -1),
          {
            ...lastPoint,
            offset_kg: lastPoint.offset_kg + delta,
          },
        ];

        return {
          ...current,
          totalOffsetKg: current.totalOffsetKg + delta,
          avgOffsetPerTree: Math.max(
            1,
            Math.round((current.totalOffsetKg + delta) / current.totalTrees)
          ),
          data: updatedData,
        };
      });
    }, 4000);

    return () => window.clearInterval(interval);
  }, [dashboardData]);

  const activeStats = useMemo(
    () => dashboardData ?? rangeData[selectedRange],
    [dashboardData, selectedRange]
  );

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Carbon Footprint</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
            View your live carbon offset accumulation, progress over time, and sustainability
            achievements.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div
            className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1 shadow-sm dark:border-slate-800 dark:bg-slate-950"
            role="tablist"
            aria-label="Time range selection"
          >
            {rangeOptions.map((option) => (
              <button
                key={option.value}
                id={`carbon-range-${option.value}-tab`}
                type="button"
                role="tab"
                aria-controls={tabPanelId}
                aria-selected={selectedRange === option.value}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  selectedRange === option.value
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
                onClick={() => setSelectedRange(option.value)}
                disabled={isLoading}
              >
                {option.label}
              </button>
            ))}
          </div>

          <Button
            onClick={() => loadData(selectedRange)}
            disabled={!canRefresh}
            variant="purple-outline"
            size="sm"
            className="min-w-[150px]"
          >
            <RefreshCw className="h-4 w-4" />
            {isLoading ? 'Refreshing…' : 'Refresh stats'}
          </Button>
        </div>
      </section>

      {error ? (
        <Card className="border-destructive/20 bg-destructive/5 text-destructive">
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="text-destructive">Unable to load dashboard data</CardTitle>
                <CardDescription>{error}</CardDescription>
              </div>
              <Button onClick={() => loadData(selectedRange)} variant="default" size="sm">
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div
        role="tabpanel"
        id={tabPanelId}
        aria-labelledby={`carbon-range-${selectedRange}-tab`}
        aria-live="polite"
        aria-busy={isLoading}
        className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]"
      >
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <StatCard
            label="Total Trees Sponsored"
            value={activeStats.totalTrees}
            description="Deepen your forest contribution with each new sponsorship."
            icon={<TreePine className="h-5 w-5" />}
            loading={isLoading}
          />
          <StatCard
            label="Total CO₂ Offset"
            value={activeStats.totalOffsetKg}
            suffix=" kg"
            description="Cumulative carbon removal tracked in real time."
            icon={<Wind className="h-5 w-5" />}
            loading={isLoading}
          />
          <StatCard
            label="Average Offset / Tree"
            value={activeStats.avgOffsetPerTree}
            suffix=" kg"
            description="Average projected offset per active tree."
            icon={<Sparkles className="h-5 w-5" />}
            loading={isLoading}
          />
          <Card className="group border-transparent bg-slate-950 text-white shadow-lg transition-all hover:shadow-2xl">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-white">Live Contributors</CardTitle>
              <CardDescription className="text-slate-300">
                Active donors and sponsors currently supporting your impact.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  <div className="h-12 w-24 rounded-xl bg-slate-800 animate-pulse" />
                  <div className="h-4 w-28 rounded-full bg-slate-800 animate-pulse" />
                </div>
              ) : (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-4xl font-black tracking-tight text-white">
                      {activeStats.contributorCount}
                    </p>
                    <p className="text-sm text-slate-300">contributors now</p>
                  </div>
                  <div className="rounded-3xl border border-white/10 bg-white/10 px-3 py-2 text-sm text-white/90">
                    Live
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/70">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
              Real-time carbon accumulation
            </p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              The dashboard updates automatically as your offset numbers grow, and it is fully
              responsive across all devices.
            </p>
          </div>

          <SocialShareCard
            totalTrees={activeStats.totalTrees}
            totalOffsetKg={activeStats.totalOffsetKg}
          />
        </div>
      </div>

      {/* Swap Widget */}
      <div className="grid grid-cols-1 gap-6">
        <CarbonCreditSwapWidget />
      </div>

      {/* Main Chart Area */}
      <div className="grid grid-cols-1 gap-6">
        {isLoading ? (
          <div
            role="status"
            aria-live="polite"
            aria-label="Loading carbon projection chart"
            className="h-[320px] rounded-3xl bg-muted animate-pulse"
          />
        ) : (
          <CarbonChart data={activeStats.data} />
        )}
      </div>

      <div className="grid grid-cols-1 gap-6">
        <BadgesList badges={mockBadges} />
      </div>

      {/* Impact Comparison Section */}
      <div className="grid grid-cols-1 gap-6">
        <SponsorImpactComparison
          sponsorCo2OffsetKg={activeStats.totalOffsetKg}
          sponsorTreeCount={activeStats.totalTrees}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
