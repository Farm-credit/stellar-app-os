'use client';

import { useCallback } from 'react';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import type { TreeFilterBarProps } from '@/lib/types/tree';
import { Search, X } from 'lucide-react';

function formatStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/**
 * TreeFilterBar — search and filter controls for trees by species, region, and status.
 * Requirements: Issue #539
 */
export function TreeFilterBar({
  filters,
  speciesOptions,
  regionOptions,
  statusOptions,
  onFilterChange,
}: TreeFilterBarProps) {
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onFilterChange({ search: e.target.value });
    },
    [onFilterChange]
  );

  const handleClearSearch = useCallback(() => {
    onFilterChange({ search: '' });
  }, [onFilterChange]);

  const hasActiveFilters =
    filters.search ||
    filters.species !== 'all' ||
    filters.region !== 'all' ||
    filters.status !== 'all';

  return (
    <div className="space-y-4">
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          <Search className="h-4 w-4" aria-hidden="true" />
        </div>
        <Input
          type="search"
          placeholder="Search by tree ID, species, region, or project..."
          value={filters.search}
          onChange={handleSearchChange}
          variant="primary"
          className="pl-10 pr-10"
          aria-label="Search trees"
        />
        {filters.search && (
          <Button
            onClick={handleClearSearch}
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="tree-species-filter" className="sr-only">
            Filter by species
          </label>
          <Select
            id="tree-species-filter"
            variant="primary"
            value={filters.species}
            onChange={(e) => onFilterChange({ species: e.target.value as typeof filters.species })}
            aria-label="Filter by species"
          >
            <option value="all">All Species</option>
            {speciesOptions.map((species) => (
              <option key={species} value={species}>
                {species}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label htmlFor="tree-region-filter" className="sr-only">
            Filter by region
          </label>
          <Select
            id="tree-region-filter"
            variant="primary"
            value={filters.region}
            onChange={(e) => onFilterChange({ region: e.target.value })}
            aria-label="Filter by region"
          >
            <option value="all">All Regions</option>
            {regionOptions.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label htmlFor="tree-status-filter" className="sr-only">
            Filter by status
          </label>
          <Select
            id="tree-status-filter"
            variant="primary"
            value={filters.status}
            onChange={(e) => onFilterChange({ status: e.target.value as typeof filters.status })}
            aria-label="Filter by status"
          >
            <option value="all">All Statuses</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {formatStatus(status)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <Text variant="small" as="span" className="text-muted-foreground">
            Active filters:
          </Text>
          {filters.species !== 'all' && (
            <Button
              onClick={() => onFilterChange({ species: 'all' })}
              stellar="primary-outline"
              size="sm"
              className="h-7 text-xs"
              aria-label={`Remove ${filters.species} filter`}
            >
              {filters.species}
              <X className="ml-1 h-3 w-3" />
            </Button>
          )}
          {filters.region !== 'all' && (
            <Button
              onClick={() => onFilterChange({ region: 'all' })}
              stellar="primary-outline"
              size="sm"
              className="h-7 text-xs"
              aria-label={`Remove ${filters.region} filter`}
            >
              {filters.region}
              <X className="ml-1 h-3 w-3" />
            </Button>
          )}
          {filters.status !== 'all' && (
            <Button
              onClick={() => onFilterChange({ status: 'all' })}
              stellar="primary-outline"
              size="sm"
              className="h-7 text-xs"
              aria-label={`Remove ${filters.status} filter`}
            >
              {formatStatus(filters.status)}
              <X className="ml-1 h-3 w-3" />
            </Button>
          )}
          {filters.search && (
            <Button
              onClick={handleClearSearch}
              stellar="primary-outline"
              size="sm"
              className="h-7 text-xs"
              aria-label="Clear search filter"
            >
              Search: &quot;
              {filters.search.length > 20 ? `${filters.search.slice(0, 20)}...` : filters.search}
              &quot;
              <X className="ml-1 h-3 w-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
