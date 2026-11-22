'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/molecules/Card';
import type { TreeAnalyticsReport, TreeAnalyticsRow } from '@/lib/analytics/tree-survival';

const DIMENSIONS = [
  ['species', 'Species'],
  ['region', 'Region'],
  ['planter_team', 'Planter team'],
] as const;

function MetricTable({ rows }: { rows: TreeAnalyticsRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-3">Group</th>
            <th className="px-3 py-3">Trees</th>
            <th className="px-3 py-3">Survival</th>
            <th className="px-3 py-3">Cost / tree</th>
            <th className="px-3 py-3">Sponsors</th>
            <th className="px-3 py-3">Retention</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.dimension}-${row.value}`}
              className="border-b border-border/60 last:border-0"
            >
              <th className="px-3 py-3 font-medium">{row.value}</th>
              <td className="px-3 py-3">{row.treeCount}</td>
              <td className="px-3 py-3">{row.survivalRatePct.toFixed(1)}%</td>
              <td className="px-3 py-3">{row.costPerTreeXlm.toFixed(2)} XLM</td>
              <td className="px-3 py-3">{row.sponsorCount}</td>
              <td className="px-3 py-3">{row.sponsorRetentionRatePct.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="p-4 text-sm text-muted-foreground">
          No analytics rows match the selected filters.
        </p>
      )}
    </div>
  );
}

export default function TreeSurvivalAnalyticsPage() {
  const [report, setReport] = useState<TreeAnalyticsReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ species: '', region: '', planterTeam: '' });

  useEffect(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    setLoading(true);
    fetch(`/api/admin/analytics/tree-survival?${params}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Analytics request failed (${response.status})`);
        return (await response.json()) as TreeAnalyticsReport;
      })
      .then(setReport)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : 'Failed to load analytics')
      )
      .finally(() => setLoading(false));
  }, [filters]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin/analytics" className="text-sm text-stellar-blue hover:underline">
            ← Admin analytics
          </Link>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Tree survival analytics</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Compare survival, cost per tree, and sponsor retention by species, region, and planter
            team.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(filters).map(([key, value]) => (
            <input
              key={key}
              aria-label={key}
              value={value}
              placeholder={key}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              onChange={(event) =>
                setFilters((current) => ({ ...current, [key]: event.target.value }))
              }
            />
          ))}
        </div>
      </div>
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {loading && <p className="text-sm text-muted-foreground">Loading analytics…</p>}
      {report && !loading && (
        <div className="space-y-6">
          {DIMENSIONS.map(([key, label]) => (
            <Card key={key}>
              <CardHeader>
                <CardTitle>{label}</CardTitle>
              </CardHeader>
              <CardContent>
                <MetricTable rows={report.dimensions[key]} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
