'use client';

import { type JSX, useState, useEffect } from 'react';
import { Leaf, Users, Sprout } from 'lucide-react';
import { MetricCard } from './MetricCard';
import { AnalyticsChart, type ChartDataPoint } from './AnalyticsChart';

export interface AnalyticsData {
  co2Reduced: {
    current: number;
    change: number;
    history: ChartDataPoint[];
  };
  activePlanters: {
    current: number;
    change: number;
    history: ChartDataPoint[];
  };
  totalAcres: {
    current: number;
    change: number;
    history: ChartDataPoint[];
  };
}

export function ImpactAnalyticsDashboard(): JSX.Element {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalyticsData | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        await new Promise((resolve) => setTimeout(resolve, 1500));

        const mockData: AnalyticsData = {
          co2Reduced: {
            current: 125000,
            change: 15.3,
            history: [
              { label: 'Jan', value: 85000 },
              { label: 'Feb', value: 92000 },
              { label: 'Mar', value: 98000 },
              { label: 'Apr', value: 105000 },
              { label: 'May', value: 115000 },
              { label: 'Jun', value: 125000 },
            ],
          },
          activePlanters: {
            current: 2450,
            change: 8.7,
            history: [
              { label: 'Jan', value: 1800 },
              { label: 'Feb', value: 1950 },
              { label: 'Mar', value: 2100 },
              { label: 'Apr', value: 2200 },
              { label: 'May', value: 2350 },
              { label: 'Jun', value: 2450 },
            ],
          },
          totalAcres: {
            current: 12500,
            change: 12.1,
            history: [
              { label: 'Jan', value: 9500 },
              { label: 'Feb', value: 10200 },
              { label: 'Mar', value: 10800 },
              { label: 'Apr', value: 11500 },
              { label: 'May', value: 12000 },
              { label: 'Jun', value: 12500 },
            ],
          },
        };

        setData(mockData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load analytics data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (error) {
    return (
      <div className="flex h-[400px] items-center justify-center rounded-xl border border-border bg-card p-6">
        <div className="text-center">
          <p className="text-lg font-semibold text-destructive">Error loading analytics</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-foreground">Impact Analytics</h1>
        <p className="text-muted-foreground">
          Track environmental impact and planting progress across all regions
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          title="CO₂ Reduced (tons)"
          value={data?.co2Reduced.current.toLocaleString() || '---'}
          change={data?.co2Reduced.change}
          icon={<Leaf className="h-5 w-5" />}
          trend={data?.co2Reduced.change && data.co2Reduced.change > 0 ? 'up' : 'neutral'}
          loading={loading}
        />
        <MetricCard
          title="Active Planters"
          value={data?.activePlanters.current.toLocaleString() || '---'}
          change={data?.activePlanters.change}
          icon={<Users className="h-5 w-5" />}
          trend={data?.activePlanters.change && data.activePlanters.change > 0 ? 'up' : 'neutral'}
          loading={loading}
        />
        <MetricCard
          title="Total Hectares"
          value={data?.totalAcres.current.toLocaleString() || '---'}
          change={data?.totalAcres.change}
          icon={<Sprout className="h-5 w-5" />}
          trend={data?.totalAcres.change && data.totalAcres.change > 0 ? 'up' : 'neutral'}
          loading={loading}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <AnalyticsChart
          title="CO₂ Reduced Over Time"
          data={data?.co2Reduced.history || []}
          type="line"
          loading={loading}
        />
        <AnalyticsChart
          title="Active Planters Over Time"
          data={data?.activePlanters.history || []}
          type="bar"
          loading={loading}
        />
      </div>

      <AnalyticsChart
        title="Total Hectares Over Time"
        data={data?.totalAcres.history || []}
        type="line"
        loading={loading}
        className="lg:col-span-2"
      />
    </div>
  );
}
