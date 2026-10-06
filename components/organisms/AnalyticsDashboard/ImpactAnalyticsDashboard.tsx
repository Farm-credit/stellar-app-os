'use client';

import { type JSX, useState, useEffect } from 'react';
import { Droplets, Leaf, Sprout, TreePine, Users } from 'lucide-react';
import { MetricCard } from './MetricCard';
import { AnalyticsChart, type ChartDataPoint } from './AnalyticsChart';
import {
  PROJECT_IMPACT_DIMENSIONS,
  buildProjectImpactSnapshot,
  formatImpactMetric,
  type ProjectImpactDimension,
  type ProjectImpactResponse,
  type ProjectImpactSnapshot,
} from '@/lib/impact/project-impact';

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
  projectImpact: ProjectImpactSnapshot;
}

export interface ImpactAnalyticsDashboardProps {
  /** When set, the dashboard is scoped to a single offset project. */
  projectId?: string;
  projectName?: string;
}

const DIMENSION_ICONS: Record<ProjectImpactDimension, JSX.Element> = {
  emissionsReduced: <Leaf className="h-5 w-5" />,
  jobsCreated: <Users className="h-5 w-5" />,
  soilCarbonSequestered: <Sprout className="h-5 w-5" />,
  waterQualityImproved: <Droplets className="h-5 w-5" />,
  biodiversity: <TreePine className="h-5 w-5" />,
};

export function ImpactAnalyticsDashboard({
  projectId,
  projectName,
}: ImpactAnalyticsDashboardProps = {}): JSX.Element {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [projectImpact, setProjectImpact] = useState<ProjectImpactSnapshot | null>(null);
  const [hasProjectData, setHasProjectData] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        if (projectId) {
          const response = await fetch(
            `/api/projects/${encodeURIComponent(projectId)}/impact`,
            { cache: 'no-store' }
          );

          if (!response.ok) {
            const payload = await response.json().catch(() => null);
            throw new Error(
              payload?.error ?? `Failed to load project impact (${response.status})`
            );
          }

          const payload: ProjectImpactResponse = await response.json();
          if (cancelled) {
            return;
          }
          setProjectImpact(payload.snapshot);
          setHasProjectData(payload.hasData);
        } else {
          await new Promise((resolve) => setTimeout(resolve, 150));
          if (cancelled) {
            return;
          }

          setData({
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
            projectImpact: buildProjectImpactSnapshot(),
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load analytics data');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchData();
    const refreshTimer = window.setInterval(fetchData, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, [projectId]);

  if (projectId) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">
            {projectName ? `${projectName} impact` : 'Project impact'}
          </h1>
          <p className="text-muted-foreground">
            Real-time environmental and community outcomes for this offset project. Updated every
            30 seconds.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive"
          >
            <p className="font-semibold">Error loading project impact</p>
            <p>{error}</p>
          </div>
        )}

        {!error && (loading || hasProjectData) && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {PROJECT_IMPACT_DIMENSIONS.map(({ dimension, label, unit }) => {
              const metric = projectImpact?.[dimension] ?? { value: 0, unit, change: 0 };
              const change = projectImpact?.[dimension]?.change ?? 0;

              return (
                <MetricCard
                  key={dimension}
                  title={label}
                  value={formatImpactMetric(metric)}
                  change={change}
                  icon={DIMENSION_ICONS[dimension]}
                  trend={change > 0 ? 'up' : change < 0 ? 'down' : 'neutral'}
                  loading={loading}
                />
              );
            })}
          </div>
        )}

        {!error && !loading && !hasProjectData && (
          <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">No impact measurements yet</p>
            <p className="mt-1">
              This project has not reported emissions reduced, jobs created, soil carbon
              sequestered, water quality or biodiversity outcomes yet. Metrics appear here as soon
              as the first report is indexed.
            </p>
          </div>
        )}

        {!error && !loading && hasProjectData && projectImpact?.asOf && (
          <p className="text-xs text-muted-foreground">
            Last synchronized: {new Date(projectImpact.asOf).toLocaleString()}
          </p>
        )}
      </div>
    );
  }

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

      <section aria-labelledby="project-impact-heading" className="space-y-4">
        <div>
          <h2 id="project-impact-heading" className="text-xl font-semibold text-foreground">
            Project impact tracking
          </h2>
          <p className="text-sm text-muted-foreground">
            Verified environmental and community outcomes across active projects. Updated every 30
            seconds.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <MetricCard
            title="Emissions reduced"
            value={formatImpactMetric(
              data?.projectImpact.emissionsReduced ?? { value: 0, unit: 'tCO₂e', change: 0 }
            )}
            change={data?.projectImpact.emissionsReduced.change}
            icon={<Leaf className="h-5 w-5" />}
            trend="up"
            loading={loading}
          />
          <MetricCard
            title="Jobs created"
            value={formatImpactMetric(
              data?.projectImpact.jobsCreated ?? { value: 0, unit: 'jobs', change: 0 }
            )}
            change={data?.projectImpact.jobsCreated.change}
            icon={<Users className="h-5 w-5" />}
            trend="up"
            loading={loading}
          />
          <MetricCard
            title="Soil carbon"
            value={formatImpactMetric(
              data?.projectImpact.soilCarbonSequestered ?? { value: 0, unit: 'tCO₂e', change: 0 }
            )}
            change={data?.projectImpact.soilCarbonSequestered.change}
            icon={<Sprout className="h-5 w-5" />}
            trend="up"
            loading={loading}
          />
          <MetricCard
            title="Water quality"
            value={formatImpactMetric(
              data?.projectImpact.waterQualityImproved ?? { value: 0, unit: 'hectares', change: 0 }
            )}
            change={data?.projectImpact.waterQualityImproved.change}
            icon={<Droplets className="h-5 w-5" />}
            trend="up"
            loading={loading}
          />
          <MetricCard
            title="Biodiversity"
            value={formatImpactMetric(
              data?.projectImpact.biodiversity ?? { value: 0, unit: 'projects', change: 0 }
            )}
            change={data?.projectImpact.biodiversity.change}
            icon={<TreePine className="h-5 w-5" />}
            trend="up"
            loading={loading}
          />
        </div>
        {data?.projectImpact.asOf && (
          <p className="text-xs text-muted-foreground">
            Last synchronized: {new Date(data.projectImpact.asOf).toLocaleString()}
          </p>
        )}
      </section>

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
