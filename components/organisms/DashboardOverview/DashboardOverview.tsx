'use client';

import { useUserDashboard } from '@/hooks/useUserDashboard';
import { useMemo } from 'react';
import { StatCard, StatCardSkeleton } from './StatCard';
import { RecentActivity, RecentActivitySkeleton } from './RecentActivity';
import { QuickActions } from './QuickActions';
import { AnalyticsWidget, type ChartDataPoint } from '@/components/AnalyticsWidget';
import { Text } from '@/components/atoms/Text';
import { Card, CardContent } from '@/components/molecules/Card';
import { Heart, Coins, Wind, Zap } from 'lucide-react';

export function DashboardOverview() {
  const { data, isLoading, error, retry } = useUserDashboard();

  /**
   * Generate mock analytics data for the last 30 days
   */
  const analyticsData = useMemo((): ChartDataPoint[] => {
    const days: ChartDataPoint[] = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dayName = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      days.push({
        name: dayName,
        donations: Math.floor(Math.random() * 500) + 100,
        carbonCredits: Math.floor(Math.random() * 50) + 10,
        transactions: Math.floor(Math.random() * 100) + 20,
      });
    }
    return days;
  }, []);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-background min-h-[400px]">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20 text-red-600 mb-6 font-bold shadow-sm">
          !
        </div>
        <Text variant="h3" className="mb-2 text-red-600 font-bold">Failed to load dashboard</Text>
        <Text variant="muted" className="mb-6 max-w-sm mx-auto font-medium">{error}</Text>
        <button
          onClick={retry}
          className="rounded-full bg-stellar-blue px-8 py-3 font-semibold text-white transition hover:bg-stellar-blue/90 shadow-lg shadow-stellar-blue/20"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <section className="space-y-8">
        <div className="flex flex-col space-y-2">
          <Text variant="h2" className="text-4xl font-black tracking-tight">Overview</Text>
          <Text variant="muted" className="text-lg font-medium opacity-70">Welcome back! Here's your impact at a glance.</Text>
        </div>
        
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {isLoading ? (
            <>
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </>
          ) : (
            <>
              <StatCard
                label="Total Donations"
                value={`$${data?.stats.totalDonationsAmount.toLocaleString()}`}
                subValue={`+${data?.stats.totalDonationsTrees} Trees planted`}
                positive
                icon={<Heart size={24} />}
              />
              <StatCard
                label="Carbon Credits"
                value={`${data?.stats.totalCarbonCreditsOwned.toLocaleString()} T`}
                subValue="Currently Owned"
                icon={<Coins size={24} />}
              />
              <StatCard
                label="CO2 Offset"
                value={`${((data?.stats.totalCO2OffsetKg || 0) / 1000).toLocaleString()} T`}
                subValue="Climate impact"
                positive
                icon={<Wind size={24} />}
              />
              <StatCard
                label="Active Projects"
                value="5"
                subValue="Supporting now"
                icon={<Zap size={24} />}
              />
            </>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-10 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {isLoading ? <RecentActivitySkeleton /> : <RecentActivity activities={data?.recentActivity} />}
        </div>
        <div className="lg:col-span-1">
          <QuickActions />
        </div>
      </section>

      {/* Analytics Section */}
      <section className="space-y-8">
        <div className="flex flex-col space-y-2">
          <Text variant="h2" className="text-2xl font-bold tracking-tight">Activity Analytics</Text>
          <Text variant="muted" className="text-sm font-medium opacity-70">Your 30-day activity trends and metrics</Text>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <AnalyticsWidget
            chartType="line"
            title="Donations Over Time"
            data={analyticsData}
            dataKeys={['donations']}
            colors={['#3b82f6']}
            showDateRange
            showExport
            showLegend
            height={300}
          />
          <AnalyticsWidget
            chartType="bar"
            title="Carbon Credits & Transactions"
            data={analyticsData}
            dataKeys={['carbonCredits', 'transactions']}
            colors={['#10b981', '#f59e0b']}
            showDateRange
            showExport
            showLegend
            height={300}
          />
        </div>
      </section>
    </div>
  );
}
