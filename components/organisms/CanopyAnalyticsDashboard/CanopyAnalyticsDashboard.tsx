'use client';

import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CANOPY_SOURCES,
  SAMPLE_SURVEYS,
  buildCoverageSeries,
  buildHeightHistogram,
  buildSpeciesMix,
  filterBySource,
  summarize,
  surveysToCsv,
  surveysToJson,
  type CanopyDataSource,
  type CanopySurvey,
} from '@/lib/canopy/analytics';

const COLORS = ['#15803d', '#0ea5e9', '#f59e0b', '#a855f7', '#64748b', '#ef4444'];

interface CanopyAnalyticsDashboardProps {
  surveys?: CanopySurvey[];
}

function download(filename: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function CanopyAnalyticsDashboard({
  surveys = SAMPLE_SURVEYS,
}: CanopyAnalyticsDashboardProps) {
  const [source, setSource] = useState<CanopyDataSource | 'all'>('all');

  const filtered = useMemo(() => filterBySource(surveys, source), [surveys, source]);
  const summary = useMemo(() => summarize(filtered), [filtered]);
  const coverage = useMemo(() => buildCoverageSeries(filtered), [filtered]);
  const latest = coverage.length
    ? filtered.find((s) => s.date === coverage.at(-1)?.date)
    : undefined;
  const species = useMemo(() => buildSpeciesMix(latest), [latest]);
  const histogram = useMemo(() => buildHeightHistogram(latest?.treeHeightsM ?? []), [latest]);

  const stats = [
    { label: 'Canopy coverage', value: `${summary.latestCoveragePercent}%` },
    { label: 'Canopy area', value: `${summary.latestCanopyAreaHa} ha` },
    { label: 'Mean canopy height', value: `${summary.meanHeightM} m` },
    { label: 'Growth rate', value: `${summary.growthRatePctPerYear} pp/yr` },
  ];

  return (
    <section aria-labelledby="canopy-heading" className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 id="canopy-heading" className="text-3xl font-bold">
            Canopy Analytics
          </h1>
          <p className="text-muted-foreground">
            Coverage, species composition, height and growth from lidar, drone and satellite
            surveys.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm" htmlFor="canopy-source">
            Data source
          </label>
          <select
            id="canopy-source"
            className="rounded-md border bg-background px-2 py-1 text-sm"
            value={source}
            onChange={(e) => setSource(e.target.value as CanopyDataSource | 'all')}
          >
            <option value="all">All sources</option>
            {CANOPY_SOURCES.map((s) => (
              <option key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="rounded-md border px-3 py-1 text-sm hover:bg-muted"
            onClick={() => download('canopy-analytics.csv', surveysToCsv(filtered), 'text/csv')}
          >
            Export CSV
          </button>
          <button
            type="button"
            className="rounded-md border px-3 py-1 text-sm hover:bg-muted"
            onClick={() =>
              download('canopy-analytics.json', surveysToJson(filtered), 'application/json')
            }
          >
            Export JSON
          </button>
          <button
            type="button"
            className="rounded-md border px-3 py-1 text-sm hover:bg-muted"
            onClick={() => window.print()}
          >
            Print / PDF
          </button>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-lg border p-4">
            <dt className="text-sm text-muted-foreground">{s.label}</dt>
            <dd className="text-2xl font-semibold">{s.value}</dd>
          </div>
        ))}
      </dl>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground">No surveys available for this data source.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <figure className="rounded-lg border p-4" aria-label="Canopy coverage over time">
            <figcaption className="mb-2 font-medium">Canopy coverage (%) over time</figcaption>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={coverage}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis unit="%" domain={[0, 100]} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="coveragePercent"
                  name="Coverage (%)"
                  stroke="#15803d"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </figure>

          <figure className="rounded-lg border p-4" aria-label="Species mix">
            <figcaption className="mb-2 font-medium">
              Species mix{latest ? ` (${latest.date}, ${latest.source})` : ''}
            </figcaption>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={species}
                  dataKey="percent"
                  nameKey="species"
                  innerRadius={60}
                  outerRadius={100}
                >
                  {species.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </figure>

          <figure className="rounded-lg border p-4 lg:col-span-2" aria-label="Height histogram">
            <figcaption className="mb-2 font-medium">Canopy height histogram</figcaption>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={histogram}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" name="Trees" fill="#0ea5e9" />
              </BarChart>
            </ResponsiveContainer>
          </figure>
        </div>
      )}
    </section>
  );
}
