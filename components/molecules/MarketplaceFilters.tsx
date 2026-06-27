'use client';

import { useMemo, useCallback } from 'react';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import type {
  FundingStatus,
  MarketplaceFiltersProps,
} from '@/lib/types/marketplace';
import { Search, X } from 'lucide-react';

export function MarketplaceFilters({
  projectTypes,
  locations,
  fundingStatuses,
  selectedType,
  selectedLocation,
  selectedFundingStatus,
  sortBy,
  searchQuery,
  activeFilterCount,
  onTypeChange,
  onLocationChange,
  onFundingStatusChange,
  onSortChange,
  onSearchChange,
  onClearAllFilters,
}: MarketplaceFiltersProps) {
  const handleTypeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      onTypeChange(value === '' ? null : (value as typeof selectedType));
    },
    [onTypeChange]
  );

  const handleLocationChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      onLocationChange(value === '' ? null : value);
    },
    [onLocationChange]
  );

  const handleFundingStatusChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      onFundingStatusChange(value === '' ? null : (value as FundingStatus));
    },
    [onFundingStatusChange]
  );

  const handleSortChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onSortChange(e.target.value as typeof sortBy);
    },
    [onSortChange]
  );

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSearchChange(e.target.value);
    },
    [onSearchChange]
  );

  const handleClearSearch = useCallback(() => {
    onSearchChange('');
  }, [onSearchChange]);

  const filterLabel = useMemo(() => {
    if (activeFilterCount === 0) return 'No active filters';
    return `${activeFilterCount} active ${activeFilterCount === 1 ? 'filter' : 'filters'}`;
  }, [activeFilterCount]);

  return (
    <div className="space-y-6 rounded-3xl border border-border bg-background p-4 lg:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Text variant="h4" as="h2">
            Filters
          </Text>
          <Text variant="muted" as="p" className="text-sm">
            Refine marketplace listings by category, location, status, or sort order.
          </Text>
        </div>
        <div className="rounded-full bg-stellar-blue/10 px-3 py-1 text-xs font-semibold text-stellar-blue">
          {filterLabel}
        </div>
      </div>

      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          <Search className="h-4 w-4" aria-hidden="true" />
        </div>
        <Input
          type="search"
          placeholder="Search projects, sellers, location..."
          value={searchQuery}
          onChange={handleSearchChange}
          variant="primary"
          className="pl-10 pr-10"
          aria-label="Search marketplace listings"
        />
        {searchQuery && (
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

      <div className="grid gap-4">
        <div>
          <Text variant="label" as="p" className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
            Category
          </Text>
          <Select
            id="project-type-filter"
            variant="primary"
            value={selectedType || ''}
            onChange={handleTypeChange}
            aria-label="Filter by project category"
          >
            <option value="">All Project Types</option>
            {projectTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Text variant="label" as="p" className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
            Location
          </Text>
          <Select
            id="location-filter"
            variant="primary"
            value={selectedLocation || ''}
            onChange={handleLocationChange}
            aria-label="Filter by project location"
          >
            <option value="">All Locations</option>
            {locations.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Text variant="label" as="p" className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
            Funding status
          </Text>
          <Select
            id="funding-status-filter"
            variant="primary"
            value={selectedFundingStatus || ''}
            onChange={handleFundingStatusChange}
            aria-label="Filter by funding status"
          >
            <option value="">All Funding Statuses</option>
            {fundingStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Text variant="label" as="p" className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
            Sort by
          </Text>
          <Select
            id="sort-by"
            variant="primary"
            value={sortBy}
            onChange={handleSortChange}
            aria-label="Sort marketplace listings"
          >
            <option value="date-newest">Newest</option>
            <option value="funded">Most Funded</option>
            <option value="ending-soon">Ending Soon</option>
            <option value="alphabetical">Alphabetical</option>
          </Select>
        </div>
      </div>

      {(selectedType || selectedLocation || selectedFundingStatus || searchQuery) && (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <Text variant="small" className="font-semibold">
              Active filters
            </Text>
            <Button
              onClick={onClearAllFilters}
              variant="ghost"
              size="sm"
              className="h-8"
              aria-label="Clear all filters"
            >
              Clear all
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedType && (
              <Button
                onClick={() => onTypeChange(null)}
                stellar="primary-outline"
                size="sm"
                className="h-8 text-xs"
                aria-label={`Remove ${selectedType} category filter`}
              >
                {selectedType}
                <X className="ml-1 h-3 w-3" />
              </Button>
            )}
            {selectedLocation && (
              <Button
                onClick={() => onLocationChange(null)}
                stellar="primary-outline"
                size="sm"
                className="h-8 text-xs"
                aria-label={`Remove ${selectedLocation} location filter`}
              >
                {selectedLocation}
                <X className="ml-1 h-3 w-3" />
              </Button>
            )}
            {selectedFundingStatus && (
              <Button
                onClick={() => onFundingStatusChange(null)}
                stellar="primary-outline"
                size="sm"
                className="h-8 text-xs"
                aria-label={`Remove ${selectedFundingStatus} funding status filter`}
              >
                {selectedFundingStatus}
                <X className="ml-1 h-3 w-3" />
              </Button>
            )}
            {searchQuery && (
              <Button
                onClick={handleClearSearch}
                stellar="primary-outline"
                size="sm"
                className="h-8 text-xs"
                aria-label="Clear search query"
              >
                Search: {searchQuery.length > 20 ? `${searchQuery.slice(0, 20)}...` : searchQuery}
                <X className="ml-1 h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
