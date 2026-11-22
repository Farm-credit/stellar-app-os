'use client';

import { useMemo, useState, type JSX } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowDown, ArrowUp, Clock, List, Map as MapIcon, TreePine, Wind } from 'lucide-react';
import { Badge } from '@/components/atoms/Badge';
import { Skeleton } from '@/components/atoms/Skeleton';
import { useSponsorTrees } from '@/hooks/useSponsorTrees';
import {
  DEFAULT_QUICK_FILTERS,
  GROWTH_LABELS,
  HEALTH_LABELS,
  co2AbsorbedKg,
  deriveGrowthStage,
  deriveHealth,
  filterTrees,
  formatCo2,
  sortTrees,
  summariseForest,
  type ForestQuickFilters,
  type ForestSortKey,
  type SortDirection,
  type TreeHealth,
} from '@/lib/forest/insights';
import type { Tree, TreeFilterState } from '@/lib/types/tree';

const ForestMap = dynamic(() => import('./ForestMap'), {
  ssr: false,
  loading: () => <div className="h-[480px] w-full animate-pulse rounded-3xl bg-muted" />,
});

type ViewMode = 'list' | 'map';

const HEALTH_BADGE: Record<TreeHealth, 'success' | 'default' | 'secondary' | 'destructive'> = {
  healthy: 'success',
  establishing: 'default',
  pending: 'secondary',
  at_risk: 'destructive',
};

const COLUMNS: { key: ForestSortKey; label: string }[] = [
  { key: 'species', label: 'Species' },
  { key: 'region', label: 'Location' },
  { key: 'health', label: 'Health' },
  { key: 'planted', label: 'Planted' },
  { key: 'co2', label: 'CO₂ absorbed' },
];

function formatPlanted(tree: Tree): string {
  return tree.plantedAt ? new Date(tree.plantedAt).toLocaleDateString('en-US') : 'Not yet planted';
}

/**
 * My Forest explorer (#1641): summary stats, species/health/location quick
 * filters, and a map/list toggle with a sortable list showing health and
 * growth status at a glance.
 */
export function MyForestExplorer({
  initialFilters,
}: {
  initialFilters?: Partial<TreeFilterState>;
}): JSX.Element {
  // Fetch the sponsor's full portfolio; quick filters are applied client-side.
  const { trees, isLoading, error } = useSponsorTrees();
  const [view, setView] = useState<ViewMode>('list');
  const [filters, setFilters] = useState<ForestQuickFilters>({
    ...DEFAULT_QUICK_FILTERS,
    species: initialFilters?.species ?? 'all',
    region: initialFilters?.region ?? 'all',
  });
  const [sort, setSort] = useState<{ key: ForestSortKey; direction: SortDirection }>({
    key: 'planted',
    direction: 'asc',
  });

  const speciesOptions = useMemo(() => [...new Set(trees.map((t) => t.species))].sort(), [trees]);
  const regionOptions = useMemo(() => [...new Set(trees.map((t) => t.region))].sort(), [trees]);
  const filtered = useMemo(() => filterTrees(trees, filters), [trees, filters]);
  const sorted = useMemo(
    () => sortTrees(filtered, sort.key, sort.direction),
    [filtered, sort.key, sort.direction]
  );
  const summary = useMemo(() => summariseForest(filtered), [filtered]);

  const toggleSort = (key: ForestSortKey): void =>
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' }
    );

  const selectClass =
    'rounded-lg border border-input bg-background px-3 py-2 text-sm font-medium min-w-[150px]';

  return (
    <section aria-labelledby="forest-explorer-heading" className="space-y-6">
      <h2 id="forest-explorer-heading" className="text-xl font-black tracking-tight">
        Your Trees
      </h2>

      {/* Summary stats */}
      <dl className="grid gap-4 sm:grid-cols-3" data-testid="forest-summary">
        {[
          { icon: TreePine, label: 'Total trees', value: String(summary.totalTrees) },
          { icon: Wind, label: 'CO₂ absorbed', value: formatCo2(summary.totalCo2AbsorbedKg) },
          {
            icon: Clock,
            label: 'Years sponsored',
            value: summary.yearsSponsored.toFixed(1),
          },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-3 rounded-2xl border p-4">
            <Icon className="h-5 w-5 text-stellar-green" aria-hidden />
            <div>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-2xl font-black">{isLoading ? '—' : value}</dd>
            </div>
          </div>
        ))}
      </dl>

      {/* Quick filters and view toggle */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
            Species
            <select
              className={selectClass}
              value={filters.species}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  species: e.target.value as ForestQuickFilters['species'],
                }))
              }
            >
              <option value="all">All species</option>
              {speciesOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
            Health
            <select
              className={selectClass}
              value={filters.health}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  health: e.target.value as ForestQuickFilters['health'],
                }))
              }
            >
              <option value="all">All health states</option>
              {(Object.keys(HEALTH_LABELS) as TreeHealth[]).map((h) => (
                <option key={h} value={h}>
                  {HEALTH_LABELS[h]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
            Location
            <select
              className={selectClass}
              value={filters.region}
              onChange={(e) => setFilters((f) => ({ ...f, region: e.target.value }))}
            >
              <option value="all">All locations</option>
              {regionOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div role="group" aria-label="Forest view" className="flex rounded-lg border p-1">
          {(
            [
              { id: 'list', label: 'List', Icon: List },
              { id: 'map', label: 'Map', Icon: MapIcon },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              onClick={() => setView(id)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold ${
                view === id ? 'bg-stellar-green text-white' : 'text-muted-foreground'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden /> {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      )}

      {isLoading ? (
        <Skeleton className="h-64 w-full rounded-3xl" />
      ) : sorted.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
          No trees match your filters.
        </p>
      ) : view === 'map' ? (
        <ForestMap trees={sorted} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-muted/50">
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={
                      sort.key === col.key
                        ? sort.direction === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                    className="px-4 py-3"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className="flex items-center gap-1 font-semibold"
                    >
                      {col.label}
                      {sort.key === col.key &&
                        (sort.direction === 'asc' ? (
                          <ArrowUp className="h-3 w-3" aria-hidden />
                        ) : (
                          <ArrowDown className="h-3 w-3" aria-hidden />
                        ))}
                    </button>
                  </th>
                ))}
                <th scope="col" className="px-4 py-3 font-semibold">
                  Growth
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((tree) => {
                const health = deriveHealth(tree);
                return (
                  <tr key={tree.id} className="border-t">
                    <td className="px-4 py-3 font-semibold">
                      <Link
                        href={`/trees/${encodeURIComponent(tree.id)}`}
                        className="hover:underline"
                      >
                        {tree.species}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{tree.region}</td>
                    <td className="px-4 py-3">
                      <Badge variant={HEALTH_BADGE[health]}>{HEALTH_LABELS[health]}</Badge>
                    </td>
                    <td className="px-4 py-3">{formatPlanted(tree)}</td>
                    <td className="px-4 py-3">{formatCo2(co2AbsorbedKg(tree))}</td>
                    <td className="px-4 py-3">{GROWTH_LABELS[deriveGrowthStage(tree)]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
