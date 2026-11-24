'use client';

import { useEffect, useState } from 'react';
import { Activity, AlertCircle, Info } from 'lucide-react';
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Legend,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/molecules/Card';
import { Badge } from '@/components/atoms/Badge';
import { Text } from '@/components/atoms/Text';
import {
  SOIL_INDICATORS,
  type ProjectSoilHealthReport,
  type SoilIndicatorKey,
} from '@/lib/services/project-soil-health';

interface SoilHealthSectionProps {
  projectId: string;
}

type SectionState =
  | { status: 'loading' }
  | { status: 'ready'; report: ProjectSoilHealthReport }
  | { status: 'empty' }
  | { status: 'error'; message: string };

const formatDate = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString('en', { month: 'short', year: 'numeric' });

const formatValue = (key: SoilIndicatorKey, value: number) => {
  const indicator = SOIL_INDICATORS.find((candidate) => candidate.key === key);
  const precision = indicator?.precision ?? 1;
  const unit = indicator?.unit ?? '';
  return unit ? `${value.toFixed(precision)} ${unit}` : value.toFixed(precision);
};

/**
 * Soil health indicators for a project (issue #1664).
 *
 * Reads the measurement series from /api/v2/projects/:id/soil-health, plots the
 * published indicator ranges on a radar chart (baseline vs latest) and lists the
 * change per indicator. Provenance is shown verbatim, including the sample-data
 * notice, so illustrative values are never presented as verified measurements.
 */
export function SoilHealthSection({ projectId }: SoilHealthSectionProps) {
  const [state, setState] = useState<SectionState>({ status: 'loading' });

  useEffect(() => {
    if (!projectId) {
      setState({ status: 'empty' });
      return;
    }

    const controller = new AbortController();

    const load = async () => {
      setState({ status: 'loading' });
      try {
        const response = await fetch(
          `/api/v2/projects/${encodeURIComponent(projectId)}/soil-health`,
          { signal: controller.signal, cache: 'no-store' }
        );

        if (response.status === 404) {
          setState({ status: 'empty' });
          return;
        }
        if (!response.ok) {
          setState({
            status: 'error',
            message: `Could not load soil health data (HTTP ${response.status}).`,
          });
          return;
        }

        const report = (await response.json()) as ProjectSoilHealthReport;
        if (!report.readings?.length) {
          setState({ status: 'empty' });
          return;
        }
        setState({ status: 'ready', report });
      } catch (error) {
        if ((error as { name?: string }).name === 'AbortError') return;
        setState({ status: 'error', message: 'Could not load soil health data.' });
      }
    };

    void load();
    return () => controller.abort();
  }, [projectId]);

  const ready = state.status === 'ready' ? state.report : null;
  const baselineReading = ready ? ready.readings[0] : null;
  const latestReading = ready ? ready.readings[ready.readings.length - 1] : null;

  return (
    <section id="soil-health" aria-labelledby="soil-health-title">
      <Text id="soil-health-title" variant="h3" className="mb-6 flex items-center gap-2 font-bold">
        Soil Health
        <div className="h-px flex-1 bg-stellar-blue/20" />
      </Text>

      {state.status === 'loading' && (
        <Card>
          <CardContent className="p-6">
            <div
              className="h-4 w-48 animate-pulse rounded bg-muted"
              role="status"
              aria-label="Loading soil health data"
            />
          </CardContent>
        </Card>
      )}

      {state.status === 'empty' && (
        <Card>
          <CardContent className="flex items-center gap-3 p-6">
            <Info className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <Text variant="muted">
              No soil health measurements are available for this project yet.
            </Text>
          </CardContent>
        </Card>
      )}

      {state.status === 'error' && (
        <Card>
          <CardContent className="flex items-center gap-3 p-6" role="status">
            <AlertCircle className="h-5 w-5 text-amber-500" aria-hidden="true" />
            <Text variant="muted">{state.message}</Text>
          </CardContent>
        </Card>
      )}

      {ready && baselineReading && latestReading && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-stellar-green" aria-hidden="true" />
                Soil indicators over time
              </CardTitle>
              <Text variant="muted" className="mt-2 text-sm">
                Source: {ready.source}
              </Text>
            </div>
            <Badge variant="outline">
              {ready.isSampleData ? 'Sample data' : 'Field measurements'}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-6">
            {ready.isSampleData && (
              <div
                role="note"
                className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-muted-foreground"
              >
                Illustrative values only. These are not verified soil test results or actual project
                measurements.
              </div>
            )}

            {ready.hasHistory ? (
              <Text variant="muted" className="text-sm">
                {ready.improvedCount} of {ready.comparison.length} indicators higher than the{' '}
                {formatDate(baselineReading.date)} baseline.
              </Text>
            ) : (
              <Text variant="muted" className="text-sm">
                One measurement on file ({formatDate(latestReading.date)}). A comparison will appear
                after the next field measurement.
              </Text>
            )}

            <div className="h-72 w-full" aria-label="Radar chart comparing soil indicators">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart
                  data={ready.comparison.map((row) => ({
                    subject: row.label,
                    Previous: row.baselinePercentOfScale,
                    Current: row.latestPercentOfScale,
                  }))}
                >
                  <PolarGrid />
                  <PolarAngleAxis dataKey="subject" />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} />
                  <Tooltip formatter={(value) => `${Number(value).toFixed(0)}% of scale`} />
                  <Legend />
                  <Radar
                    name={formatDate(baselineReading.date)}
                    dataKey="Previous"
                    stroke="var(--color-stellar-cyan)"
                    fill="var(--color-stellar-cyan)"
                    fillOpacity={0.15}
                  />
                  <Radar
                    name={formatDate(latestReading.date)}
                    dataKey="Current"
                    stroke="var(--color-stellar-green)"
                    fill="var(--color-stellar-green)"
                    fillOpacity={0.25}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-sm">
                <caption className="sr-only">Historical soil health readings</caption>
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Indicator
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      {formatDate(baselineReading.date)}
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      {formatDate(latestReading.date)}
                    </th>
                    {ready.hasHistory && (
                      <th scope="col" className="py-2 font-medium">
                        Change
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {ready.comparison.map((row) => (
                    <tr key={row.key} className="border-b last:border-0">
                      <th scope="row" className="py-3 pr-4 font-medium">
                        {row.label}
                      </th>
                      <td className="py-3 pr-4">{formatValue(row.key, row.baseline)}</td>
                      <td className="py-3 pr-4">{formatValue(row.key, row.latest)}</td>
                      {ready.hasHistory && (
                        <td
                          className={
                            row.direction === 'up'
                              ? 'py-3 text-stellar-green'
                              : row.direction === 'down'
                                ? 'py-3 text-amber-500'
                                : 'py-3 text-muted-foreground'
                          }
                        >
                          {row.direction === 'flat' ? (
                            'No change'
                          ) : (
                            <>
                              {row.direction === 'up' ? '+' : '−'}
                              {formatValue(row.key, Math.abs(row.change))}
                            </>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
