'use client';

import React from 'react';
import { Filter, RotateCcw, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { GrowthRate, TreeBrowseFilters } from '@/lib/trees/browse';
import type { TreeSpecies } from '@/lib/types/tree';

export interface TreeBrowseSidebarProps {
  filters: TreeBrowseFilters;
  speciesOptions: TreeSpecies[];
  regionOptions: string[];
  speciesCounts: Record<string, number>;
  activeFilterCount: number;
  onFiltersChange: (next: Partial<TreeBrowseFilters>) => void;
  onReset: () => void;
}

const GROWTH_RATE_OPTIONS: Array<{ value: GrowthRate | 'all'; label: string }> = [
  { value: 'all', label: 'All rates' },
  { value: 'fast', label: 'Fast' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'slow', label: 'Slow' },
];

export function TreeBrowseSidebar({
  filters,
  speciesOptions,
  regionOptions,
  speciesCounts,
  activeFilterCount,
  onFiltersChange,
  onReset,
}: TreeBrowseSidebarProps) {
  const toggleSpecies = (species: TreeSpecies) => {
    const exists = filters.species.includes(species);
    const nextSpecies = exists
      ? filters.species.filter((s) => s !== species)
      : [...filters.species, species];
    onFiltersChange({ species: nextSpecies });
  };

  return (
    <aside
      aria-label="Tree browse filters"
      className="rounded-xl border border-border bg-card p-5 shadow-sm"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border pb-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          <h2 className="text-base font-semibold text-foreground">Filters</h2>
          {activeFilterCount > 0 && (
            <Badge variant="secondary" aria-label={`${activeFilterCount} active filters`}>
              {activeFilterCount}
            </Badge>
          )}
        </div>
        {activeFilterCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Reset
          </Button>
        )}
      </div>

      <div className="mt-5 space-y-6">
        {/* Search */}
        <div>
          <Label htmlFor="tree-browse-search" className="text-sm font-medium text-foreground">
            Search trees
          </Label>
          <div className="relative mt-2">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="tree-browse-search"
              type="search"
              value={filters.search}
              onChange={(e) => onFiltersChange({ search: e.target.value })}
              placeholder="Species, project, region..."
              className="pl-9"
            />
          </div>
        </div>

        {/* Native Region Dropdown */}
        <div>
          <Label htmlFor="native-region-filter" className="text-sm font-medium text-foreground">
            Native region
          </Label>
          <select
            id="native-region-filter"
            aria-label="Native region"
            value={filters.nativeRegion}
            onChange={(e) => onFiltersChange({ nativeRegion: e.target.value })}
            className="mt-2 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="all">All regions</option>
            {regionOptions.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
        </div>

        {/* Multi-select Species Filter */}
        <fieldset>
          <div className="flex items-center justify-between">
            <legend className="text-sm font-medium text-foreground">Species</legend>
            {filters.species.length > 0 && (
              <button
                type="button"
                onClick={() => onFiltersChange({ species: [] })}
                className="text-xs font-medium text-emerald-600 hover:underline"
              >
                Clear ({filters.species.length})
              </button>
            )}
          </div>
          <div className="mt-2.5 max-h-60 space-y-2 overflow-y-auto pr-1">
            {speciesOptions.map((species) => {
              const checked = filters.species.includes(species);
              const checkboxId = `species-filter-${species.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
              return (
                <label
                  key={species}
                  htmlFor={checkboxId}
                  className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
                >
                  <span className="flex items-center gap-2.5">
                    <input
                      id={checkboxId}
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSpecies(species)}
                      className="h-4 w-4 rounded border-input text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-foreground">{species}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {speciesCounts[species] ?? 0}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* Growth Rate Filter */}
        <fieldset>
          <legend className="text-sm font-medium text-foreground">Growth rate</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {GROWTH_RATE_OPTIONS.map((option) => {
              const isSelected = filters.growthRate === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => onFiltersChange({ growthRate: option.value })}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                    isSelected
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-border bg-background text-foreground hover:bg-muted'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* CO2 Absorption Rate Range */}
        <fieldset>
          <legend className="text-sm font-medium text-foreground">
            CO₂ absorption rate (kg/yr)
          </legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="min-co2-filter" className="text-xs text-muted-foreground">
                Min kg/yr
              </Label>
              <Input
                id="min-co2-filter"
                type="number"
                min={0}
                placeholder="0"
                value={filters.minCo2KgPerYear ?? ''}
                onChange={(e) =>
                  onFiltersChange({
                    minCo2KgPerYear: e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
                className="mt-1 h-9"
              />
            </div>
            <div>
              <Label htmlFor="max-co2-filter" className="text-xs text-muted-foreground">
                Max kg/yr
              </Label>
              <Input
                id="max-co2-filter"
                type="number"
                min={0}
                placeholder="50"
                value={filters.maxCo2KgPerYear ?? ''}
                onChange={(e) =>
                  onFiltersChange({
                    maxCo2KgPerYear: e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
                className="mt-1 h-9"
              />
            </div>
          </div>
        </fieldset>
      </div>
    </aside>
  );
}
