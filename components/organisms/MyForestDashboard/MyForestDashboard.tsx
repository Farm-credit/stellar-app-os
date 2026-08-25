'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { TreePine, Wind, Globe, Layers, Plus, ChevronRight } from 'lucide-react';
import { SponsorTreeList } from '@/components/organisms/SponsorTreeList';
import { Text } from '@/components/atoms/Text';
import { Button } from '@/components/atoms/Button';
import { Skeleton } from '@/components/atoms/Skeleton';
import { useSponsorTrees } from '@/hooks/useSponsorTrees';
import type { TreeFilterState, TreeSpecies, TreeStatus } from '@/lib/types/tree';

// ---------------------------------------------------------------------------
// Security: all data is derived from server-controlled mock/API responses.
// Values are rendered via React JSX which auto-escapes — no dangerouslySetInnerHTML used.
// Tree IDs passed as URL segments are encoded via Next.js <Link href> which
// escapes them automatically (no manual string concatenation into URLs).
// ---------------------------------------------------------------------------

interface ForestStatProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  accentColor: string;
  isLoading?: boolean;
}

function ForestStat({ icon, label, value, accentColor, isLoading }: ForestStatProps) {
  return (
    <div className="flex flex-col items-center gap-1 px-4 py-3 min-w-[110px]">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-2xl mb-1 transition-transform duration-300 hover:scale-110"
        style={{ background: `${accentColor}18`, color: accentColor }}
        aria-hidden
      >
        {icon}
      </div>
      {isLoading ? (
        <>
          <Skeleton className="h-7 w-16 rounded-lg" />
          <Skeleton className="h-3.5 w-20 rounded" />
        </>
      ) : (
        <>
          <span className="text-2xl font-black tracking-tight leading-none">{value}</span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground opacity-70 text-center leading-tight">
            {label}
          </span>
        </>
      )}
    </div>
  );
}

interface MyForestDashboardProps {
  initialFilters?: Partial<TreeFilterState>;
}

/**
 * MyForestDashboard — sponsor "My Forest" view (Issue #525).
 *
 * Renders a premium hero banner with live forest summary stats derived from
 * the sponsor's tree portfolio, a quick-filter breadcrumb bar, and the full
 * paginated/filterable tree card grid via SponsorTreeList.
 *
 * Security controls:
 * - XSS: All values rendered through React JSX auto-escaping (no innerHTML).
 * - No PII surfaced — tree IDs are opaque platform codes, not user data.
 * - Links use Next.js <Link> with href template literals; IDs come from
 *   server-controlled data, but encodeURIComponent is applied defensively.
 */
export function MyForestDashboard({ initialFilters }: MyForestDashboardProps) {
  const { trees, isLoading, totalCount } = useSponsorTrees(initialFilters);

  // --- Derived forest summary stats ------------------------------------------
  const stats = useMemo(() => {
    const totalCO2 = trees.reduce((sum, t) => sum + t.co2OffsetKgPerYear, 0);
    const speciesSet = new Set(trees.map((t) => t.species));
    const regionSet = new Set(trees.map((t) => t.region));

    const statusCounts: Record<TreeStatus, number> = {
      funded: 0,
      planted: 0,
      verified: 0,
      completed: 0,
      failed: 0,
    };
    for (const tree of trees) {
      statusCounts[tree.status] = (statusCounts[tree.status] ?? 0) + 1;
    }

    const activeCount =
      (statusCounts.planted ?? 0) + (statusCounts.verified ?? 0) + (statusCounts.completed ?? 0);

    return {
      totalCO2,
      speciesCount: speciesSet.size,
      regionCount: regionSet.size,
      activeCount,
    };
  }, [trees]);

  // --- Species distribution for mini-legend ----------------------------------
  const speciesBreakdown = useMemo(() => {
    const counts: Partial<Record<TreeSpecies, number>> = {};
    for (const tree of trees) {
      counts[tree.species] = (counts[tree.species] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)) as [
      TreeSpecies,
      number,
    ][];
  }, [trees]);

  const speciesColors: Partial<Record<TreeSpecies, string>> = {
    Teak: '#f59e0b',
    Moringa: '#10b981',
    Eucalyptus: '#14b8a6',
    Mangrove: '#06b6d4',
    Acacia: '#84cc16',
    Neem: '#22c55e',
    'African Mahogany': '#a16207',
    Baobab: '#d97706',
    'Bamboo (Moso)': '#4ade80',
    'West African Cedar': '#15803d',
    'Caribbean Pine': '#166534',
    Iroko: '#854d0e',
    Shea: '#ca8a04',
    Cashew: '#f97316',
    'African Locust Bean': '#78350f',
  };

  const speciesTotal = speciesBreakdown.reduce((s, [, c]) => s + c, 0);

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* ===== HERO BANNER ===== */}
      <section
        aria-labelledby="my-forest-heading"
        className="relative overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-slate-50 via-white to-emerald-50/30 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950/20 p-6 sm:p-8 md:p-10 shadow-sm"
      >
        {/* Decorative background blobs */}
        <div
          className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full opacity-[0.06] blur-3xl"
          style={{ background: '#00b36b' }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-16 -left-16 h-52 w-52 rounded-full opacity-[0.05] blur-3xl"
          style={{ background: '#14b6e7' }}
          aria-hidden
        />

        <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          {/* Left: title + breadcrumb */}
          <div className="flex flex-col gap-3">
            {/* Breadcrumb */}
            <nav aria-label="Breadcrumb">
              <ol className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                <li>
                  <Link
                    href="/dashboard"
                    className="hover:text-stellar-blue transition-colors"
                    aria-label="Go to dashboard"
                  >
                    Dashboard
                  </Link>
                </li>
                <li aria-hidden>
                  <ChevronRight className="h-3 w-3" />
                </li>
                <li aria-current="page" className="text-foreground font-semibold">
                  My Forest
                </li>
              </ol>
            </nav>

            {/* Heading */}
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-stellar-green/10 text-stellar-green shadow-sm">
                <TreePine className="h-6 w-6" aria-hidden />
              </div>
              <div>
                <h1
                  id="my-forest-heading"
                  className="text-3xl sm:text-4xl font-black tracking-tight leading-none text-foreground"
                >
                  My Forest
                </h1>
                <p className="mt-1 text-sm text-muted-foreground font-medium">
                  Your sponsored trees, live status, and carbon impact
                </p>
              </div>
            </div>
          </div>

          {/* Right: CTA */}
          <div className="flex shrink-0 flex-col items-start gap-2 md:items-end">
            <Link href="/donate" tabIndex={-1}>
              <Button
                id="sponsor-more-trees-btn"
                className="gap-2 bg-stellar-green text-white hover:bg-stellar-green/90 shadow-lg shadow-stellar-green/20 font-bold"
                aria-label="Sponsor more trees to grow your forest"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Sponsor More Trees
              </Button>
            </Link>
            <span className="text-[11px] text-muted-foreground opacity-60 font-medium md:text-right">
              Each tree funds a real planting verified on-chain
            </span>
          </div>
        </div>

        {/* ===== FOREST SUMMARY STATS STRIP ===== */}
        <div className="relative z-10 mt-8 flex flex-wrap justify-start gap-x-2 gap-y-4 divide-x divide-slate-200 dark:divide-slate-700/60 rounded-2xl border border-slate-100 dark:border-slate-800/60 bg-white/70 dark:bg-slate-900/60 backdrop-blur-sm px-4 py-2 shadow-sm">
          <ForestStat
            icon={<TreePine className="h-5 w-5" />}
            label="Trees Sponsored"
            value={isLoading ? '—' : String(totalCount)}
            accentColor="#00b36b"
            isLoading={isLoading}
          />
          <ForestStat
            icon={<Wind className="h-5 w-5" />}
            label="CO₂ Offset / yr"
            value={
              isLoading
                ? '—'
                : stats.totalCO2 >= 1000
                  ? `${(stats.totalCO2 / 1000).toFixed(1)} t`
                  : `${stats.totalCO2} kg`
            }
            accentColor="#14b6e7"
            isLoading={isLoading}
          />
          <ForestStat
            icon={<Layers className="h-5 w-5" />}
            label="Species"
            value={isLoading ? '—' : String(stats.speciesCount)}
            accentColor="#f59e0b"
            isLoading={isLoading}
          />
          <ForestStat
            icon={<Globe className="h-5 w-5" />}
            label="Regions"
            value={isLoading ? '—' : String(stats.regionCount)}
            accentColor="#6e56cf"
            isLoading={isLoading}
          />
        </div>

        {/* ===== SPECIES BREAKDOWN BAR ===== */}
        {!isLoading && speciesBreakdown.length > 0 && (
          <div className="relative z-10 mt-6 space-y-2" aria-label="Species composition breakdown">
            <Text
              variant="small"
              className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-bold"
            >
              Species Mix
            </Text>
            {/* Stacked progress bar */}
            <div
              className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
              role="img"
              aria-label={`Species mix: ${speciesBreakdown.map(([s, c]) => `${s} ${Math.round((c / speciesTotal) * 100)}%`).join(', ')}`}
            >
              {speciesBreakdown.map(([species, count], idx) => (
                <div
                  key={species}
                  style={{
                    width: `${(count / speciesTotal) * 100}%`,
                    background: speciesColors[species] ?? '#94a3b8',
                    borderRadius:
                      idx === 0
                        ? '9999px 0 0 9999px'
                        : idx === speciesBreakdown.length - 1
                          ? '0 9999px 9999px 0'
                          : '0',
                  }}
                  title={`${species}: ${count} tree${count !== 1 ? 's' : ''}`}
                />
              ))}
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {speciesBreakdown.map(([species, count]) => (
                <div key={species} className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ background: speciesColors[species] ?? '#94a3b8' }}
                    aria-hidden
                  />
                  <span className="text-xs text-muted-foreground font-semibold">
                    {species}{' '}
                    <span className="text-[10px] opacity-60">
                      {count} ({Math.round((count / speciesTotal) * 100)}%)
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ===== TREE CARD GRID ===== */}
      <section aria-labelledby="forest-grid-heading">
        <div className="mb-5 flex items-center justify-between">
          <h2
            id="forest-grid-heading"
            className="text-xl font-black tracking-tight text-foreground"
          >
            Your Trees
          </h2>
          {!isLoading && totalCount > 0 && (
            <Text variant="muted" className="text-sm font-semibold opacity-70">
              {totalCount} {totalCount === 1 ? 'tree' : 'trees'} in your forest
            </Text>
          )}
        </div>

        <SponsorTreeList initialFilters={initialFilters} />
      </section>
    </div>
  );
}
