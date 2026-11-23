'use client';

import React, { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpDown, Globe2, Leaf, Sprout, TreePine, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { TreeBrowseSidebar } from '@/components/trees/TreeBrowseSidebar';
import {
  DEFAULT_TREE_BROWSE_FILTERS,
  SPONSORABLE_TREES,
  filterAndSortSponsorableTrees,
  getAvailableNativeRegions,
  getAvailableSpecies,
  type GrowthRate,
  type SponsorableTree,
  type TreeBrowseFilters,
  type TreeBrowseSortBy,
} from '@/lib/trees/browse';

export interface TreeBrowseCatalogProps {
  trees?: SponsorableTree[];
}

const SORT_OPTIONS: Array<{ value: TreeBrowseSortBy; label: string }> = [
  { value: 'co2_desc', label: 'CO₂ sequestration: High to Low' },
  { value: 'co2_asc', label: 'CO₂ sequestration: Low to High' },
  { value: 'growth_rate', label: 'Growth rate: Fastest first' },
  { value: 'price_asc', label: 'Sponsorship cost: Low to High' },
  { value: 'price_desc', label: 'Sponsorship cost: High to Low' },
  { value: 'name_asc', label: 'Species name: A to Z' },
];

const GROWTH_RATE_BADGE_STYLES: Record<GrowthRate, string> = {
  fast: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  moderate: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  slow: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
};

export function TreeBrowseCatalog({ trees = SPONSORABLE_TREES }: TreeBrowseCatalogProps) {
  const [filters, setFilters] = useState<TreeBrowseFilters>(DEFAULT_TREE_BROWSE_FILTERS);

  const speciesOptions = useMemo(() => getAvailableSpecies(trees), [trees]);
  const regionOptions = useMemo(() => getAvailableNativeRegions(trees), [trees]);

  const speciesCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tree of trees) {
      counts[tree.species] = (counts[tree.species] ?? 0) + 1;
    }
    return counts;
  }, [trees]);

  const filteredTrees = useMemo(
    () => filterAndSortSponsorableTrees(trees, filters),
    [trees, filters]
  );

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.search.trim()) count += 1;
    if (filters.species.length > 0) count += filters.species.length;
    if (filters.nativeRegion !== 'all') count += 1;
    if (filters.growthRate !== 'all') count += 1;
    if (filters.minCo2KgPerYear !== undefined) count += 1;
    if (filters.maxCo2KgPerYear !== undefined) count += 1;
    return count;
  }, [filters]);

  const handleFiltersChange = useCallback((next: Partial<TreeBrowseFilters>) => {
    setFilters((prev) => ({ ...prev, ...next }));
  }, []);

  const handleReset = useCallback(() => {
    setFilters(DEFAULT_TREE_BROWSE_FILTERS);
  }, []);

  return (
    <div className="grid gap-8 lg:grid-cols-[290px_1fr] lg:items-start">
      <TreeBrowseSidebar
        filters={filters}
        speciesOptions={speciesOptions}
        regionOptions={regionOptions}
        speciesCounts={speciesCounts}
        activeFilterCount={activeFilterCount}
        onFiltersChange={handleFiltersChange}
        onReset={handleReset}
      />

      <section aria-label="Available trees for sponsorship" className="space-y-5">
        {/* Toolbar: Result count + Sort by CO2 sequestration rate */}
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground" role="status">
            Showing <span className="font-semibold text-foreground">{filteredTrees.length}</span> of{' '}
            <span className="font-semibold text-foreground">{trees.length}</span> available tree
            {trees.length === 1 ? '' : 's'}
          </p>

          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <label htmlFor="tree-sort-select" className="text-sm font-medium text-foreground">
              Sort by
            </label>
            <select
              id="tree-sort-select"
              aria-label="Sort trees"
              value={filters.sortBy}
              onChange={(e) => handleFiltersChange({ sortBy: e.target.value as TreeBrowseSortBy })}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Active filter chips */}
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {filters.species.map((sp) => (
              <Badge key={sp} variant="secondary" className="gap-1 pr-1.5">
                {sp}
                <button
                  type="button"
                  aria-label={`Remove ${sp} filter`}
                  onClick={() =>
                    handleFiltersChange({
                      species: filters.species.filter((item) => item !== sp),
                    })
                  }
                  className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </Badge>
            ))}
            {filters.nativeRegion !== 'all' && (
              <Badge variant="secondary" className="gap-1 pr-1.5">
                Region: {filters.nativeRegion}
                <button
                  type="button"
                  aria-label="Remove native region filter"
                  onClick={() => handleFiltersChange({ nativeRegion: 'all' })}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </Badge>
            )}
            {filters.growthRate !== 'all' && (
              <Badge variant="secondary" className="gap-1 pr-1.5 capitalize">
                Growth: {filters.growthRate}
                <button
                  type="button"
                  aria-label="Remove growth rate filter"
                  onClick={() => handleFiltersChange({ growthRate: 'all' })}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </Badge>
            )}
            {(filters.minCo2KgPerYear !== undefined || filters.maxCo2KgPerYear !== undefined) && (
              <Badge variant="secondary" className="gap-1 pr-1.5">
                CO₂: {filters.minCo2KgPerYear ?? 0}–{filters.maxCo2KgPerYear ?? '∞'} kg/yr
                <button
                  type="button"
                  aria-label="Remove CO2 range filter"
                  onClick={() =>
                    handleFiltersChange({
                      minCo2KgPerYear: undefined,
                      maxCo2KgPerYear: undefined,
                    })
                  }
                  className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </Badge>
            )}
          </div>
        )}

        {/* Results Grid or Empty State */}
        {filteredTrees.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-14 text-center">
              <TreePine className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
              <h3 className="mt-4 text-lg font-semibold text-foreground">
                No matching trees found
              </h3>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Try adjusting your species, native region, growth rate, or CO₂ absorption rate
                filters.
              </p>
              <Button type="button" variant="outline" onClick={handleReset} className="mt-5">
                Reset all filters
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" data-testid="tree-browse-grid">
            {filteredTrees.map((tree) => (
              <Card
                key={tree.id}
                data-testid="tree-browse-card"
                className="flex flex-col justify-between transition-shadow hover:shadow-md"
              >
                <CardContent className="flex h-full flex-col justify-between p-5">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-lg font-semibold text-foreground">{tree.species}</h3>
                        <p className="text-xs italic text-muted-foreground">
                          {tree.scientificName}
                        </p>
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${GROWTH_RATE_BADGE_STYLES[tree.growthRate]}`}
                      >
                        {tree.growthRate} growth
                      </span>
                    </div>

                    <p className="mt-3 text-sm text-muted-foreground">{tree.description}</p>

                    <dl className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-3 text-xs">
                      <div>
                        <dt className="flex items-center gap-1 text-muted-foreground">
                          <Leaf className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                          CO₂ Sequestration
                        </dt>
                        <dd className="mt-1 text-sm font-semibold text-foreground">
                          {tree.co2KgPerYear} kg/yr
                        </dd>
                      </div>
                      <div>
                        <dt className="flex items-center gap-1 text-muted-foreground">
                          <Globe2 className="h-3.5 w-3.5 text-sky-600" aria-hidden="true" />
                          Native Region
                        </dt>
                        <dd className="mt-1 text-sm font-semibold text-foreground">
                          {tree.nativeRegion}
                        </dd>
                      </div>
                      <div>
                        <dt className="flex items-center gap-1 text-muted-foreground">
                          <Sprout className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                          Maturity
                        </dt>
                        <dd className="mt-1 font-medium text-foreground">
                          {tree.maturityYears} years
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Available</dt>
                        <dd className="mt-1 font-medium text-foreground">
                          {tree.availableCount} trees
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
                    <div>
                      <p className="text-xs text-muted-foreground">{tree.projectName}</p>
                      <p className="text-base font-bold text-foreground">
                        ${tree.priceUsd}
                        <span className="text-xs font-normal text-muted-foreground"> / tree</span>
                      </p>
                    </div>
                    <Button
                      asChild
                      size="sm"
                      className="bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      <Link href={`/donate?species=${encodeURIComponent(tree.species)}`}>
                        Sponsor
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
