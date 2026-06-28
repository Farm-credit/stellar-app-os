'use client';

import Link from 'next/link';
import {
  TreePine,
  MapPin,
  Leaf,
  TreeDeciduous,
  Sprout,
  Trees,
  ArrowRight,
  Calendar,
} from 'lucide-react';
import { TreeFilterBar } from '@/components/molecules/TreeFilterBar';
import { TreeStatusBadge } from '@/components/molecules/TreeStatusBadge';
import { Text } from '@/components/atoms/Text';
import { Skeleton } from '@/components/atoms/Skeleton';
import { useSponsorTrees } from '@/hooks/useSponsorTrees';
import type { TreeFilterState, TreeSpecies } from '@/lib/types/tree';

function fmtDate(iso?: string) {
  if (!iso) return 'Not yet planted';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function getSpeciesIcon(species: TreeSpecies) {
  switch (species) {
    case 'Teak':
      return <TreeDeciduous className="h-6 w-6 text-amber-500" aria-hidden />;
    case 'Moringa':
      return <Sprout className="h-6 w-6 text-emerald-500" aria-hidden />;
    case 'Eucalyptus':
      return <TreePine className="h-6 w-6 text-teal-500" aria-hidden />;
    case 'Mangrove':
      return <Trees className="h-6 w-6 text-cyan-500" aria-hidden />;
    default:
      return <TreePine className="h-6 w-6 text-stellar-green" aria-hidden />;
  }
}

const bgColors: Record<TreeSpecies, string> = {
  Teak: 'bg-amber-500/10 border-amber-500/20 dark:bg-amber-500/5 dark:border-amber-500/10',
  Moringa: 'bg-emerald-500/10 border-emerald-500/20 dark:bg-emerald-500/5 dark:border-emerald-500/10',
  Eucalyptus: 'bg-teal-500/10 border-teal-500/20 dark:bg-teal-500/5 dark:border-teal-500/10',
  Mangrove: 'bg-cyan-500/10 border-cyan-500/20 dark:bg-cyan-500/5 dark:border-cyan-500/10',
};

interface SponsorTreeListProps {
  initialFilters?: Partial<TreeFilterState>;
}

/**
 * Sponsor tree portfolio with search and filter by species, region, and status.
 * Requirements: Issue #525 / #539
 */
export function SponsorTreeList({ initialFilters }: SponsorTreeListProps) {
  const {
    trees,
    filters,
    speciesOptions,
    regionOptions,
    statusOptions,
    totalCount,
    isLoading,
    error,
    updateFilters,
  } = useSponsorTrees(initialFilters);

  return (
    <div className="space-y-6">
      <TreeFilterBar
        filters={filters}
        speciesOptions={speciesOptions}
        regionOptions={regionOptions}
        statusOptions={statusOptions}
        onFilterChange={updateFilters}
      />

      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
        <Text variant="muted" as="p" className="text-sm font-semibold opacity-85" aria-live="polite">
          {isLoading
            ? 'Loading your forest...'
            : totalCount === 0
              ? 'No trees match your filters'
              : `Showing ${totalCount} ${totalCount === 1 ? 'tree' : 'trees'} in your forest`}
        </Text>
      </div>

      {error && (
        <Text variant="small" className="text-destructive font-medium block" role="alert">
          {error}
        </Text>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-[280px] w-full rounded-3xl border border-slate-200 bg-card/60 p-6 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/60 animate-pulse flex flex-col justify-between"
            >
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Skeleton className="h-12 w-12 rounded-2xl" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-6 w-3/4 rounded-lg" />
                  <Skeleton className="h-4 w-1/2 rounded-lg" />
                </div>
                <div className="space-y-2.5 pt-2">
                  <Skeleton className="h-4 w-full rounded-lg" />
                  <Skeleton className="h-4 w-2/3 rounded-lg" />
                </div>
              </div>
              <div className="flex justify-between items-center border-t border-slate-100 pt-4 dark:border-slate-850">
                <Skeleton className="h-10 w-24 rounded-lg" />
                <Skeleton className="h-9 w-9 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      ) : trees.length === 0 ? (
        <div className="p-16 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-slate-50/50 dark:bg-slate-900/30">
          <TreePine className="h-12 w-12 text-slate-300 dark:text-slate-700 mx-auto mb-4" />
          <Text variant="h3" className="text-lg font-bold mb-2">No trees found</Text>
          <Text variant="muted" className="text-sm max-w-md mx-auto">
            Try adjusting your search or filters to find sponsored trees in your portfolio.
          </Text>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {trees.map((tree) => {
            const iconBg = bgColors[tree.species] || 'bg-stellar-green/10 border-stellar-green/20';
            return (
              <div
                key={tree.id}
                className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-200 bg-card/60 p-6 backdrop-blur-sm transition-all duration-350 hover:scale-[1.02] hover:shadow-xl hover:border-stellar-blue/30 dark:border-slate-800 dark:bg-slate-900/60"
              >
                <div className="space-y-4">
                  {/* Top Header Row with status badge and species icon */}
                  <div className="flex items-center justify-between">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl border transition-colors ${iconBg}`}
                    >
                      {getSpeciesIcon(tree.species)}
                    </div>
                    <TreeStatusBadge status={tree.status} />
                  </div>

                  {/* Title / Project info */}
                  <div className="space-y-1">
                    <Text className="text-lg font-black tracking-tight group-hover:text-stellar-blue transition-colors">
                      {tree.treeId}
                    </Text>
                    <Text
                      variant="muted"
                      className="text-xs font-semibold uppercase tracking-wider opacity-70 block truncate"
                    >
                      {tree.projectName}
                    </Text>
                  </div>

                  {/* Location & Species details */}
                  <div className="space-y-2.5 pt-3 border-t border-slate-100 dark:border-slate-800/60">
                    <div className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-400">
                      <MapPin className="h-4 w-4 shrink-0 text-slate-455" />
                      <span className="truncate">{tree.region}</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-400">
                      <Leaf className="h-4 w-4 shrink-0 text-slate-455" />
                      <span>{tree.species} Species</span>
                    </div>
                    <div className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-400">
                      <Calendar className="h-4 w-4 shrink-0 text-slate-455" />
                      <span>{fmtDate(tree.plantedAt)}</span>
                    </div>
                  </div>
                </div>

                {/* Footer Row with CO2 and Action Button */}
                <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800/60">
                  <div>
                    <Text
                      variant="small"
                      className="text-[10px] uppercase tracking-[0.15em] text-slate-400 font-bold block mb-0.5"
                    >
                      CO₂ OFFSET
                    </Text>
                    <Text className="text-base font-black text-stellar-green">
                      {tree.co2OffsetKgPerYear} kg/yr
                    </Text>
                  </div>

                  <Link
                    href={`/trees/${tree.id}`}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-stellar-blue/10 text-stellar-blue transition-all duration-300 group-hover:bg-stellar-blue group-hover:text-white"
                    aria-label={`View details for tree ${tree.treeId}`}
                  >
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
