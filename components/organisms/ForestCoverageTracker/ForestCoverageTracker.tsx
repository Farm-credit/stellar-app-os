'use client';

/**
 * ForestCoverageTracker - Issue #1653
 *
 * Shows the percentage of a project area that has reached canopy coverage,
 * measured quarterly from satellite or drone imagery:
 * - Headline coverage percentage (prominent)
 * - Progress toward the project's target coverage threshold
 * - Historical coverage trend chart with the target drawn as a reference line
 */

import { useMemo } from 'react';
import { Target } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Badge } from '@/components/atoms/Badge';
import { Text } from '@/components/atoms/Text';
import { Progress } from '@/components/ui/progress';
import {
  buildProjectCoverageSummary,
  formatCoveragePercent,
  type ProjectCoverageRecord,
} from '@/lib/canopy/project-coverage';

interface ForestCoverageTrackerProps {
  coverage: ProjectCoverageRecord;
  className?: string;
}

const SOURCE_LABEL = { satellite: 'satellite imagery', drone: 'drone survey' } as const;

/** Format an ISO date (YYYY-MM-DD) in UTC so SSR and the browser always agree. */
function formatDate(isoDate: string): string {
  return new Date(`${isoDate.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  });
}

export function ForestCoverageTracker({ coverage, className }: ForestCoverageTrackerProps) {
  const summary = useMemo(() => buildProjectCoverageSummary(coverage), [coverage]);
  const { latest, trend, targetCoveragePercent: target } = summary;

  return (
    <div className={className} data-testid="forest-coverage-tracker">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        {latest === null ? (
          <div>
            <Text variant="body" className="font-medium">
              No coverage measurements yet
            </Text>
            <Text variant="muted" className="mt-1">
              The first quarterly satellite or drone reading will appear here. Target coverage for
              this project is {formatCoveragePercent(target)}%.
            </Text>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p
                  className="text-5xl font-bold tracking-tight text-green-700 dark:text-green-500"
                  data-testid="coverage-percentage"
                >
                  {formatCoveragePercent(latest.coveragePercent)}%
                </p>
                <Text variant="muted" className="mt-1">
                  of the project area has reached canopy coverage
                </Text>
              </div>
              <Badge
                variant={summary.targetMet ? 'success' : 'outline'}
                data-testid="target-status"
              >
                {summary.targetMet
                  ? 'Target reached'
                  : `${formatCoveragePercent(summary.gapPercentagePoints)} pts to target`}
              </Badge>
            </div>

            <div className="mt-6">
              <div className="relative">
                <Progress
                  value={latest.coveragePercent}
                  className="h-3"
                  aria-label="Canopy coverage progress"
                  aria-valuetext={`${formatCoveragePercent(latest.coveragePercent)}% coverage, target ${formatCoveragePercent(target)}%`}
                />
                <div
                  aria-hidden="true"
                  data-testid="target-marker"
                  className="bg-foreground/70 absolute -top-1 -bottom-1 w-0.5"
                  style={{ left: `${target}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Target className="h-4 w-4" aria-hidden="true" />
                  Target: {formatCoveragePercent(target)}%
                </span>
                <span className="text-muted-foreground" data-testid="last-measured">
                  {latest.quarterLabel} · {SOURCE_LABEL[latest.source]} · {formatDate(latest.date)}
                </span>
              </div>
            </div>

            <figure className="mt-8" aria-label="Canopy coverage trend">
              <figcaption className="mb-2 font-medium">Coverage trend by quarter</figcaption>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={trend} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="quarterLabel" />
                  <YAxis unit="%" domain={[0, 100]} />
                  <Tooltip formatter={(value) => `${String(value)}%`} />
                  <ReferenceLine
                    y={target}
                    stroke="#b45309"
                    strokeDasharray="6 4"
                    label={{
                      value: `Target ${formatCoveragePercent(target)}%`,
                      position: 'insideBottomRight',
                      fill: '#b45309',
                      fontSize: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="coveragePercent"
                    name="Coverage"
                    stroke="#15803d"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>

              {/* Text alternative to the chart for screen readers. */}
              <table className="sr-only">
                <caption>Canopy coverage by quarter</caption>
                <thead>
                  <tr>
                    <th scope="col">Quarter</th>
                    <th scope="col">Coverage (%)</th>
                    <th scope="col">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {trend.map((point) => (
                    <tr key={point.quarter}>
                      <th scope="row">{point.quarterLabel}</th>
                      <td>{formatCoveragePercent(point.coveragePercent)}</td>
                      <td>{SOURCE_LABEL[point.source]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </figure>
          </>
        )}
      </div>
    </div>
  );
}
