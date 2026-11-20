'use client';

import { useCallback, useMemo, type ChangeEvent } from 'react';
import type { TreeSpecies } from '@/lib/types/tree';
import type { SponsoredTreeFilterOptions, SponsoredTreeFilters } from '@/lib/types/sponsored-tree';

interface SponsoredTreeMapFiltersProps {
  filters: SponsoredTreeFilters;
  options: SponsoredTreeFilterOptions;
  onFilterChange: (next: SponsoredTreeFilters) => void;
  disabled?: boolean;
}

export function SponsoredTreeMapFilters({
  filters,
  options,
  onFilterChange,
  disabled = false,
}: SponsoredTreeMapFiltersProps) {
  const handleSpeciesChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      onFilterChange({ ...filters, species: event.target.value as TreeSpecies | 'all' });
    },
    [filters, onFilterChange]
  );

  const handleYearChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value;
      onFilterChange({
        ...filters,
        plantingYear: value === 'all' ? 'all' : Number(value),
      });
    },
    [filters, onFilterChange]
  );

  const handleSponsorChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      onFilterChange({ ...filters, sponsor: event.target.value });
    },
    [filters, onFilterChange]
  );

  const handleClearAll = useCallback(() => {
    onFilterChange({ species: 'all', plantingYear: 'all', sponsor: 'all' });
  }, [onFilterChange]);

  const hasActiveFilters = useMemo(
    () => filters.species !== 'all' || filters.plantingYear !== 'all' || filters.sponsor !== 'all',
    [filters]
  );

  const selectClasses =
    'w-full rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div
      className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80"
      role="search"
      aria-label="Filter sponsored trees"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:gap-5">
        {/* Species filter */}
        <div className="min-w-0 flex-1">
          <label
            htmlFor="sponsored-tree-species-filter"
            className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-slate-500 dark:text-slate-400"
          >
            Species
          </label>
          <select
            id="sponsored-tree-species-filter"
            className={selectClasses}
            value={filters.species}
            onChange={handleSpeciesChange}
            disabled={disabled}
            aria-label="Filter by tree species"
          >
            <option value="all">All species</option>
            {options.species.map((species) => (
              <option key={species} value={species}>
                {species}
              </option>
            ))}
          </select>
        </div>

        {/* Planting year filter */}
        <div className="min-w-0 flex-1">
          <label
            htmlFor="sponsored-tree-year-filter"
            className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-slate-500 dark:text-slate-400"
          >
            Planting Year
          </label>
          <select
            id="sponsored-tree-year-filter"
            className={selectClasses}
            value={filters.plantingYear === 'all' ? 'all' : String(filters.plantingYear)}
            onChange={handleYearChange}
            disabled={disabled}
            aria-label="Filter by planting year"
          >
            <option value="all">All years</option>
            {options.plantingYears.map((year) => (
              <option key={year} value={String(year)}>
                {year}
              </option>
            ))}
          </select>
        </div>

        {/* Sponsor filter */}
        <div className="min-w-0 flex-1">
          <label
            htmlFor="sponsored-tree-sponsor-filter"
            className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-slate-500 dark:text-slate-400"
          >
            Sponsor
          </label>
          <select
            id="sponsored-tree-sponsor-filter"
            className={selectClasses}
            value={filters.sponsor}
            onChange={handleSponsorChange}
            disabled={disabled}
            aria-label="Filter by sponsor organisation"
          >
            <option value="all">All sponsors</option>
            {options.sponsors.map((sponsor) => (
              <option key={sponsor.id} value={sponsor.id}>
                {sponsor.name}
              </option>
            ))}
          </select>
        </div>

        {/* Clear all button */}
        <div className="flex-shrink-0">
          <button
            type="button"
            onClick={handleClearAll}
            disabled={disabled || !hasActiveFilters}
            className="rounded-2xl border border-slate-300 bg-white px-5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-stellar-blue focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="Clear all filters"
          >
            Clear all
          </button>
        </div>
      </div>
    </div>
  );
}
