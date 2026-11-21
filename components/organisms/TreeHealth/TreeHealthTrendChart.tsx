'use client';

import { useEffect, useState } from 'react';
import { Activity, Bug, Droplets, Ruler, TrendingDown, TrendingUp } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { HealthStatus } from '@/lib/tree-health/health-score';
import type { TreeHealthSummary } from '@/lib/tree-health/store';

interface TreeHealthTrendChartProps {
  treeId: string;
  initialSummary: TreeHealthSummary;
}

const STATUS_BADGE_STYLES: Record<HealthStatus, { label: string; className: string }> = {
  healthy: {
    label: 'Healthy',
    className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  },
  fair: {
    label: 'Fair',
    className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  },
  at_risk: {
    label: 'At Risk',
    className: 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
  },
  critical: {
    label: 'Critical',
    className: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30',
  },
};

function formatShortDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function TreeHealthTrendChart({ treeId, initialSummary }: TreeHealthTrendChartProps) {
  const [summary, setSummary] = useState<TreeHealthSummary>(initialSummary);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/trees/${encodeURIComponent(treeId)}/health`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: TreeHealthSummary | null) => {
        if (!cancelled && data && Array.isArray(data.observations)) {
          setSummary(data);
        }
      })
      .catch(() => {
        // Keep SSR initialSummary on network error
      });

    return () => {
      cancelled = true;
    };
  }, [treeId]);

  const badge = STATUS_BADGE_STYLES[summary.currentStatus];
  const latest = summary.latestObservation;
  const chartData = summary.observations.map((obs) => ({
    dateLabel: formatShortDate(obs.observedAt),
    score: obs.healthScore,
    heightCm: obs.heightCm,
    pestPresence: obs.pestPresence,
    wateringStatus: obs.wateringStatus,
  }));

  return (
    <section
      aria-labelledby="tree-health-trend-heading"
      className="rounded-xl border border-border bg-card p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <h2 id="tree-health-trend-heading" className="text-lg font-semibold text-foreground">
              Tree Health Trend
            </h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Synced from field team observations (height, pest checks, and watering status).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="flex items-baseline justify-end gap-1">
              <span className="text-2xl font-bold tabular-nums text-foreground">
                {summary.currentScore}
              </span>
              <span className="text-xs text-muted-foreground">/ 100</span>
            </div>
            {summary.trendDelta !== 0 && (
              <span
                className={`inline-flex items-center gap-0.5 text-xs font-medium ${
                  summary.trendDelta > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {summary.trendDelta > 0 ? (
                  <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5" aria-hidden />
                )}
                {summary.trendDelta > 0 ? `+${summary.trendDelta}` : summary.trendDelta} pts
              </span>
            )}
          </div>
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${badge.className}`}
          >
            {badge.label}
          </span>
        </div>
      </div>

      {/* Recharts Area Chart */}
      <div className="mt-5 h-56 w-full" role="img" aria-label="Tree health score trend over time">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id={`healthScoreFill-${treeId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.25)" />
            <XAxis
              dataKey="dateLabel"
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                borderRadius: '0.5rem',
                border: '1px solid rgba(148, 163, 184, 0.3)',
                fontSize: '0.8rem',
              }}
              formatter={(value: unknown, name: unknown) => {
                if (name === 'score') return [`${value} / 100`, 'Health Score'];
                return [String(value), String(name)];
              }}
            />
            <Area
              type="monotone"
              dataKey="score"
              stroke="#10b981"
              strokeWidth={2.5}
              fill={`url(#healthScoreFill-${treeId})`}
              activeDot={{ r: 5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Latest synced field metrics */}
      {latest && (
        <div className="mt-4 grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-3">
          <div className="flex items-center gap-2.5 rounded-lg bg-muted/50 px-3 py-2">
            <Ruler className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <div>
              <p className="text-xs text-muted-foreground">Latest Height</p>
              <p className="text-sm font-semibold text-foreground">{latest.heightCm} cm</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-lg bg-muted/50 px-3 py-2">
            <Bug className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
            <div>
              <p className="text-xs text-muted-foreground">Pest Presence</p>
              <p className="text-sm font-semibold capitalize text-foreground">
                {latest.pestPresence}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-lg bg-muted/50 px-3 py-2">
            <Droplets className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden />
            <div>
              <p className="text-xs text-muted-foreground">Watering Status</p>
              <p className="text-sm font-semibold capitalize text-foreground">
                {latest.wateringStatus}
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
