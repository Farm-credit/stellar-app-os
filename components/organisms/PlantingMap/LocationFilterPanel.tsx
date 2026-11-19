'use client';

import { useCallback, useMemo, useState } from 'react';
import { Search, X, SlidersHorizontal, Globe2, ThermometerSun, Sprout, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/atoms/Checkbox';
import { Input } from '@/components/atoms/Input';
import { TREE_SPECIES } from '@/lib/constants/species';

export interface LocationFilters {
  regions: string[];
  climates: string[];
  species: string[];
}

interface LocationFilterPanelProps {
  filters: LocationFilters;
  onChange: (filters: LocationFilters) => void;
  regionOptions: string[];
  climateOptions: string[];
  speciesOptions: string[];
  resultCount: number;
  totalCount: number;
  onMobileClose?: () => void;
}

function resolveSpeciesName(slug: string): string {
  return TREE_SPECIES.find((s) => s.slug === slug)?.name ?? slug;
}

function toggleItem<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((i) => i !== item) : [...list, item];
}

export function LocationFilterPanel({
  filters,
  onChange,
  regionOptions,
  climateOptions,
  speciesOptions,
  resultCount,
  totalCount,
  onMobileClose,
}: LocationFilterPanelProps) {
  const [speciesSearch, setSpeciesSearch] = useState('');

  const activeCount = filters.regions.length + filters.climates.length + filters.species.length;

  const filteredSpeciesOptions = useMemo(() => {
    const query = speciesSearch.trim().toLowerCase();
    if (!query) return speciesOptions;
    return speciesOptions.filter((slug) =>
      resolveSpeciesName(slug).toLowerCase().includes(query)
    );
  }, [speciesOptions, speciesSearch]);

  const handleRegionToggle = useCallback(
    (region: string) => onChange({ ...filters, regions: toggleItem(filters.regions, region) }),
    [filters, onChange]
  );

  const handleClimateToggle = useCallback(
    (climate: string) => onChange({ ...filters, climates: toggleItem(filters.climates, climate) }),
    [filters, onChange]
  );

  const handleSpeciesToggle = useCallback(
    (species: string) =>
      onChange({ ...filters, species: toggleItem(filters.species, species) }),
    [filters, onChange]
  );

  const handleClearAll = useCallback(() => {
    onChange({ regions: [], climates: [], species: [] });
    setSpeciesSearch('');
  }, [onChange]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-base font-semibold">Filters</h2>
          {activeCount > 0 && (
            <Badge variant="secondary" className="bg-stellar-purple text-white">
              {activeCount}
            </Badge>
          )}
        </div>
        {onMobileClose && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onMobileClose}
            aria-label="Close filters"
            className="lg:hidden"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <Label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Globe2 className="size-3.5" aria-hidden="true" />
              Region
            </Label>
            <span className="text-xs text-muted-foreground">
              {filters.regions.length}/{regionOptions.length}
            </span>
          </div>
          <div className="space-y-2">
            {regionOptions.map((region) => (
              <Checkbox
                key={region}
                id={`region-${region}`}
                label={region}
                checked={filters.regions.includes(region)}
                onChange={() => handleRegionToggle(region)}
                className="data-[state=checked]:bg-stellar-purple data-[state=checked]:border-stellar-purple"
              />
            ))}
            {regionOptions.length === 0 && (
              <p className="text-xs text-muted-foreground">No regions available</p>
            )}
          </div>
          {filters.regions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {filters.regions.map((region) => (
                <Badge
                  key={region}
                  variant="outline"
                  className="cursor-pointer gap-1 hover:bg-muted"
                  role="button"
                  tabIndex={0}
                  onClick={() => handleRegionToggle(region)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleRegionToggle(region);
                    }
                  }}
                  aria-label={`Remove ${region} filter`}
                >
                  {region}
                  <X className="size-3" aria-hidden="true" />
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <Label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <ThermometerSun className="size-3.5" aria-hidden="true" />
              Climate
            </Label>
            <span className="text-xs text-muted-foreground">
              {filters.climates.length}/{climateOptions.length}
            </span>
          </div>
          <div className="space-y-2">
            {climateOptions.map((climate) => (
              <Checkbox
                key={climate}
                id={`climate-${climate}`}
                label={climate}
                checked={filters.climates.includes(climate)}
                onChange={() => handleClimateToggle(climate)}
                className="data-[state=checked]:bg-stellar-purple data-[state=checked]:border-stellar-purple"
              />
            ))}
            {climateOptions.length === 0 && (
              <p className="text-xs text-muted-foreground">No climates available</p>
            )}
          </div>
          {filters.climates.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {filters.climates.map((climate) => (
                <Badge
                  key={climate}
                  variant="outline"
                  className="cursor-pointer gap-1 hover:bg-muted"
                  role="button"
                  tabIndex={0}
                  onClick={() => handleClimateToggle(climate)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleClimateToggle(climate);
                    }
                  }}
                  aria-label={`Remove ${climate} filter`}
                >
                  {climate}
                  <X className="size-3" aria-hidden="true" />
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <Label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Sprout className="size-3.5" aria-hidden="true" />
              Tree Species
            </Label>
            <span className="text-xs text-muted-foreground">
              {filters.species.length}/{speciesOptions.length}
            </span>
          </div>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="text"
              placeholder="Search species..."
              value={speciesSearch}
              onChange={(e) => setSpeciesSearch(e.target.value)}
              className="pl-8"
              variant="primary"
              inputSize="sm"
              aria-label="Search tree species"
            />
          </div>
          <div className="max-h-52 space-y-1.5 overflow-y-auto rounded-md border p-2">
            {filteredSpeciesOptions.map((slug) => (
              <label
                key={slug}
                htmlFor={`species-${slug}`}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1.5 hover:bg-muted"
              >
                <Checkbox
                  id={`species-${slug}`}
                  checked={filters.species.includes(slug)}
                  onChange={() => handleSpeciesToggle(slug)}
                  className="data-[state=checked]:bg-stellar-green data-[state=checked]:border-stellar-green"
                />
                <span className="text-sm">{resolveSpeciesName(slug)}</span>
              </label>
            ))}
            {filteredSpeciesOptions.length === 0 && (
              <p className="px-1.5 py-2 text-xs text-muted-foreground">No species match your search</p>
            )}
          </div>
          {filters.species.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {filters.species.map((slug) => (
                <Badge
                  key={slug}
                  variant="secondary"
                  className="bg-stellar-green/10 text-stellar-green hover:bg-stellar-green/20 cursor-pointer gap-1 dark:bg-stellar-green/20"
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSpeciesToggle(slug)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSpeciesToggle(slug);
                    }
                  }}
                  aria-label={`Remove ${resolveSpeciesName(slug)} species filter`}
                >
                  {resolveSpeciesName(slug)}
                  <X className="size-3" aria-hidden="true" />
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3 border-t px-5 py-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Showing</span>
          <span className="font-semibold">
            {resultCount.toLocaleString()}{' '}
            <span className="text-muted-foreground font-normal">
              of {totalCount.toLocaleString()}
            </span>
          </span>
        </div>
        {activeCount > 0 && (
          <Button variant="outline" size="sm" onClick={handleClearAll} className="w-full gap-1.5">
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Clear all filters
          </Button>
        )}
      </div>
    </div>
  );
}
