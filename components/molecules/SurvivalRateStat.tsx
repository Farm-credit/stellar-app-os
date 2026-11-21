'use client';

/**
 * SurvivalRateStat — Issue #1645
 *
 * Displays tree survival rate (percentage of planted trees still alive) for a
 * project or species, clearly labelled as field-census data or a baseline
 * estimate, with the methodology explanation in a tooltip (acceptance
 * criterion: "methodology explanation in tooltip").
 *
 * When `refreshQuery` is provided the statistic is re-fetched from
 * `/api/census/survival` on mount so statically rendered pages (species
 * guide) pick up census submissions made after the build.
 */

import { useEffect, useId, useState } from 'react';
import { Info, Leaf, TrendingDown, TrendingUp, Minus } from 'lucide-react';

import { SURVIVAL_METHODOLOGY, type SurvivalStatistic } from '@/lib/census/survival';
import { cn } from '@/lib/utils';

export interface SurvivalRateRefreshQuery {
  projectId?: string;
  speciesSlug?: string;
  speciesName?: string;
}

interface SurvivalRateStatProps {
  initial: SurvivalStatistic;
  refreshQuery?: SurvivalRateRefreshQuery;
  /** Optional card heading, e.g. the species common name. */
  heading?: string;
  className?: string;
}

function isSurvivalStatistic(value: unknown): value is SurvivalStatistic {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SurvivalStatistic>;
  return typeof candidate.survivalRate === 'number' && typeof candidate.source === 'string';
}

function buildQuery(refreshQuery: SurvivalRateRefreshQuery): string | null {
  const params = new URLSearchParams();
  if (refreshQuery.projectId) params.set('projectId', refreshQuery.projectId);
  else if (refreshQuery.speciesSlug) {
    params.set('species', refreshQuery.speciesSlug);
    if (refreshQuery.speciesName) params.set('name', refreshQuery.speciesName);
  } else return null;
  return params.toString();
}

export function SurvivalRateStat({
  initial,
  refreshQuery,
  heading = 'Tree Survival Rate',
  className,
}: SurvivalRateStatProps) {
  const [statistic, setStatistic] = useState<SurvivalStatistic>(initial);
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const methodologyId = useId();

  useEffect(() => {
    if (!refreshQuery) return;
    const query = buildQuery(refreshQuery);
    if (!query) return;

    let cancelled = false;
    async function refresh(): Promise<void> {
      try {
        const response = await fetch(`/api/census/survival?${query}`);
        if (!response.ok) return;
        const data = (await response.json()) as { statistic?: unknown };
        if (!cancelled && isSurvivalStatistic(data.statistic)) {
          setStatistic(data.statistic);
        }
      } catch {
        // Displaying the last known figure is fine when the API is unreachable.
      }
    }
    void refresh();
    return () => {
      cancelled = true;
    };
  }, [refreshQuery]);

  const { survivalRate, source, censusYear, treesCounted, historical } = statistic;
  const previous = historical.length >= 2 ? historical[historical.length - 2] : null;
  const delta = previous ? Math.round((survivalRate - previous.survivalRate) * 10) / 10 : null;

  return (
    <section
      aria-label={heading}
      className={cn('rounded-2xl border border-border bg-card p-6 shadow-sm', className)}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Leaf className="h-5 w-5 text-stellar-green" aria-hidden />
          <h3 className="text-lg font-semibold text-foreground">{heading}</h3>
        </div>
        <span
          className={cn(
            'rounded-full border px-2.5 py-0.5 text-xs font-medium',
            source === 'census'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-amber-200 bg-amber-50 text-amber-700'
          )}
        >
          {source === 'census' ? 'Field census' : 'Baseline estimate'}
        </span>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-4xl font-bold text-foreground">{survivalRate}%</span>
        <span className="text-sm text-muted-foreground">of planted trees still alive</span>

        <span className="relative inline-flex items-center gap-1">
          <button
            type="button"
            aria-label="How is the survival rate calculated?"
            aria-expanded={methodologyOpen}
            aria-controls={methodologyId}
            onMouseEnter={() => setMethodologyOpen(true)}
            onMouseLeave={() => setMethodologyOpen(false)}
            onFocus={() => setMethodologyOpen(true)}
            onBlur={() => setMethodologyOpen(false)}
            className="rounded-full p-1 text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
          >
            <Info className="h-4 w-4" aria-hidden />
          </button>
          {methodologyOpen && (
            <span
              id={methodologyId}
              role="tooltip"
              className="absolute left-0 top-full z-20 mt-2 block w-72 rounded-lg border border-border bg-popover p-3 text-xs leading-relaxed text-popover-foreground shadow-lg"
            >
              {SURVIVAL_METHODOLOGY}
            </span>
          )}
        </span>
      </div>

      {delta !== null && previous && (
        <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
          {delta > 0 ? (
            <TrendingUp className="h-4 w-4 text-emerald-600" aria-hidden />
          ) : delta < 0 ? (
            <TrendingDown className="h-4 w-4 text-red-600" aria-hidden />
          ) : (
            <Minus className="h-4 w-4" aria-hidden />
          )}
          <span>
            {delta > 0 ? '+' : ''}
            {delta} pts vs {previous.year} census
          </span>
        </p>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">
            {source === 'census' ? 'Latest census' : 'Reference year'}
          </dt>
          <dd className="font-medium text-foreground">{censusYear}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Trees counted</dt>
          <dd className="font-medium text-foreground">
            {treesCounted !== null ? treesCounted.toLocaleString() : '—'}
          </dd>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <dt className="text-xs text-muted-foreground">Update cadence</dt>
          <dd className="font-medium text-foreground">Annual field census</dd>
        </div>
      </dl>

      {source === 'baseline' && (
        <p className="mt-3 text-xs text-muted-foreground">
          No field census recorded yet — this is a platform estimate pending the next census.
        </p>
      )}
    </section>
  );
}
