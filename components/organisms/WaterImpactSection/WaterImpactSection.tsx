'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Droplets, Gauge, Waves } from 'lucide-react';
import {
  AnalyticsChart,
  type ChartDataPoint,
} from '@/components/organisms/AnalyticsDashboard/AnalyticsChart';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/molecules/Card';
import { formatLitres } from '@/lib/water/water-impact';
import type { WaterImpactResponse } from '@/lib/types/water-impact';

export interface WaterImpactSectionProps {
  projectId: string;
  projectName: string;
}

export function WaterImpactSection({ projectId, projectName }: WaterImpactSectionProps) {
  const [data, setData] = useState<WaterImpactResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/water-impact`,
          {
            cache: 'no-store',
          }
        );
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? 'Unable to load water impact');
        if (!cancelled) setData(payload as WaterImpactResponse);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Unable to load water impact');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const assessments = data?.assessments ?? [];
  const latest = assessments.at(-1);
  const chartData: ChartDataPoint[] = assessments
    .filter((assessment) => assessment.protectedLitresPerYear !== null)
    .map((assessment) => ({
      label: String(assessment.year),
      value: assessment.protectedLitresPerYear as number,
    }));

  return (
    <section id="water-impact" aria-labelledby="water-impact-title">
      <Card>
        <CardHeader>
          <CardTitle id="water-impact-title" className="flex items-center gap-2">
            <Droplets className="h-5 w-5 text-stellar-blue" aria-hidden="true" />
            Water impact
          </CardTitle>
          <CardDescription>
            Annual hydrological assessments for {projectName}. Reported values are shown as supplied
            by the project source.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p role="status" className="py-6 text-sm text-muted-foreground">
              Loading water assessments…
            </p>
          ) : error ? (
            <p role="alert" className="py-6 text-sm text-destructive">
              {error}
            </p>
          ) : !data?.hasData ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">
                No hydrological assessments published yet
              </p>
              <p className="mt-1">
                Water volumes will appear here when this project provides a verified annual
                assessment. No estimated values are shown until then.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <Metric
                  icon={<Waves className="h-4 w-4" aria-hidden="true" />}
                  label="Watershed protection"
                  value={formatLitres(latest?.watershedProtectionLitres ?? null)}
                />
                <Metric
                  icon={<Gauge className="h-4 w-4" aria-hidden="true" />}
                  label="Estimated groundwater recharge"
                  value={formatLitres(latest?.estimatedGroundwaterRechargeLitres ?? null)}
                />
                <Metric
                  icon={<Droplets className="h-4 w-4" aria-hidden="true" />}
                  label="Protected per year"
                  value={formatLitres(latest?.protectedLitresPerYear ?? null)}
                />
              </div>
              {chartData.length > 0 ? (
                <AnalyticsChart
                  title="Water protected per year (litres)"
                  data={chartData}
                  color="stroke-stellar-blue"
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Annual protected-volume chart data is not available in the latest assessment.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Latest assessment: {latest?.year ?? 'Not reported'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}
