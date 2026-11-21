'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { AlertCircle, Coins, Leaf, RefreshCw, Sprout, TreePine } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { ImpactStatCard } from '@/components/atoms/ImpactStatCard';
import { Skeleton } from '@/components/atoms/Skeleton';
import { useFarmerSuccessStories } from '@/hooks/useFarmerSuccessStories';
import type { FarmerSuccessStory } from '@/lib/types/farmer-success-story';
import {
  ALL_FILTER_VALUE,
  filterFarmerSuccessStories,
  formatHectares,
  formatTonnes,
  formatUsdcAmount,
  getUniqueProjectTypes,
  getUniqueRegions,
  summarizeFarmerSuccessStories,
} from '@/lib/utils/farmerSuccessStoryStats';
import { FarmerStoryCard } from './FarmerStoryCard';

export interface FarmerSuccessStoriesProps {
  /**
   * Optional stories. When provided, the component renders them directly
   * instead of using the internal data hook (useful for tests and previews).
   */
  stories?: FarmerSuccessStory[];
  /** Override the loading state; defaults to the data hook. */
  isLoading?: boolean;
  /** Override the error message; defaults to the data hook. */
  error?: string | null;
  /** Override the retry handler; defaults to refetching from the data hook. */
  onRetry?: () => void;
}

const HEADING_ID = 'farmer-success-stories-heading';

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stellar-blue ${
        active
          ? 'border-stellar-blue bg-stellar-blue text-white'
          : 'border-border bg-card text-foreground hover:border-stellar-blue hover:text-stellar-blue'
      }`}
    >
      {children}
    </button>
  );
}

function LoadingState() {
  return (
    <div role="status" aria-live="polite" className="mt-12">
      <span className="sr-only">Loading farmer success stories…</span>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 w-full" />
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-72 w-full" />
        ))}
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="mt-12 flex flex-col items-center gap-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center"
    >
      <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
      <div>
        <p className="font-semibold text-foreground">We couldn’t load the success stories.</p>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      </div>
      <Button variant="outline" onClick={onRetry} className="gap-2">
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Try again
      </Button>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div role="status" className="mt-12 rounded-2xl border border-dashed p-10 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export function FarmerSuccessStories({
  stories,
  isLoading,
  error,
  onRetry,
}: FarmerSuccessStoriesProps) {
  const query = useFarmerSuccessStories();
  const hasProvidedStories = stories !== undefined;
  const resolvedStories = stories ?? query.stories;
  const resolvedError =
    error !== undefined ? error : !hasProvidedStories && query.isError ? query.error : null;
  const loading = isLoading ?? (!hasProvidedStories && query.isLoading && resolvedError === null);
  const retry = onRetry ?? query.retry;

  const [region, setRegion] = useState<string>(ALL_FILTER_VALUE);
  const [projectType, setProjectType] = useState<string>(ALL_FILTER_VALUE);

  const regions = useMemo(() => getUniqueRegions(resolvedStories), [resolvedStories]);
  const projectTypes = useMemo(() => getUniqueProjectTypes(resolvedStories), [resolvedStories]);

  const visibleStories = useMemo(
    () => filterFarmerSuccessStories(resolvedStories, { region, projectType }),
    [resolvedStories, region, projectType]
  );
  const summary = useMemo(() => summarizeFarmerSuccessStories(visibleStories), [visibleStories]);

  const filtersActive = region !== ALL_FILTER_VALUE || projectType !== ALL_FILTER_VALUE;
  const clearFilters = () => {
    setRegion(ALL_FILTER_VALUE);
    setProjectType(ALL_FILTER_VALUE);
  };

  return (
    <section aria-labelledby={HEADING_ID} className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <header className="mx-auto max-w-3xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-stellar-green/30 bg-stellar-green/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-stellar-green">
          <Leaf className="h-3.5 w-3.5" aria-hidden="true" />
          Farmer success stories
        </span>
        <h1 id={HEADING_ID} className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
          Real farmers. Real income. Real restoration.
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          Case studies from farmers restoring degraded land through FarmCredit carbon projects —
          with verified income earned, land transformation, and environmental impact.
        </p>
      </header>

      {loading ? (
        <LoadingState />
      ) : resolvedError ? (
        <ErrorState message={resolvedError} onRetry={retry} />
      ) : resolvedStories.length === 0 ? (
        <EmptyState message="No farmer success stories are available yet. Check back soon." />
      ) : (
        <>
          <div className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <ImpactStatCard
              label="Total income earned"
              value={formatUsdcAmount(summary.totalIncomeEarnedUsdc)}
              icon={<Coins className="h-5 w-5 text-[#00B36B]" aria-hidden />}
            />
            <ImpactStatCard
              label="Land under restoration"
              value={formatHectares(summary.totalHectaresRestored)}
              icon={<Sprout className="h-5 w-5 text-[#14B6E7]" aria-hidden />}
            />
            <ImpactStatCard
              label="Trees planted"
              value={summary.totalTreesPlanted.toLocaleString('en-US')}
              icon={<TreePine className="h-5 w-5 text-[#3E1BDB]" aria-hidden />}
            />
            <ImpactStatCard
              label="CO₂ sequestered"
              value={formatTonnes(summary.totalCo2SequesteredTonnes)}
              icon={<Leaf className="h-5 w-5 text-[#00C2FF]" aria-hidden />}
            />
          </div>

          <div className="mt-8 flex flex-col gap-4 rounded-2xl border bg-card/50 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div role="group" aria-label="Filter by region" className="flex flex-wrap gap-2">
              <FilterChip
                active={region === ALL_FILTER_VALUE}
                onClick={() => setRegion(ALL_FILTER_VALUE)}
              >
                All regions
              </FilterChip>
              {regions.map((option) => (
                <FilterChip
                  key={option}
                  active={region === option}
                  onClick={() => setRegion(option)}
                >
                  {option}
                </FilterChip>
              ))}
            </div>

            <div role="group" aria-label="Filter by project type" className="flex flex-wrap gap-2">
              <FilterChip
                active={projectType === ALL_FILTER_VALUE}
                onClick={() => setProjectType(ALL_FILTER_VALUE)}
              >
                All project types
              </FilterChip>
              {projectTypes.map((option) => (
                <FilterChip
                  key={option}
                  active={projectType === option}
                  onClick={() => setProjectType(option)}
                >
                  {option}
                </FilterChip>
              ))}
            </div>
          </div>

          <p className="mt-6 text-sm text-muted-foreground" aria-live="polite">
            Showing {visibleStories.length} of {resolvedStories.length} case studies · average tree
            survival {summary.averageSurvivalRatePercent}%
          </p>

          {visibleStories.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No case studies match these filters. Try a different region or project type.
              </p>
              {filtersActive && (
                <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <ul className="mt-6 grid list-none gap-6 p-0 lg:grid-cols-2">
              {visibleStories.map((story) => (
                <li key={story.id} className="h-full">
                  <FarmerStoryCard story={story} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
