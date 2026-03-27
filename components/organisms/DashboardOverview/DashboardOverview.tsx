'use client';

import { useUserDashboard } from '@/hooks/useUserDashboard';
import { StatCard, StatCardSkeleton } from './StatCard';
import { RecentActivity, RecentActivitySkeleton } from './RecentActivity';
import { QuickActions } from './QuickActions';
import { Text } from '@/components/atoms/Text';
import { Card, CardContent } from '@/components/molecules/Card';
import { Heart, Coins, Wind, Zap } from 'lucide-react';

export function DashboardOverview() {
  const { data, isLoading, error, retry } = useUserDashboard();

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
    </div>
  );
}
