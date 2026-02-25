'use client';

import { useCallback } from 'react';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import type { MarketplaceFiltersProps } from '@/lib/types/marketplace';
import { Search, X } from 'lucide-react';

/**
 * MarketplaceFilters molecule component
 *
 * Provides filtering, sorting, and search controls for marketplace listings.
 * Features:
 * - Project type filter dropdown
 * - Sort by price/date dropdown
 * - Search input with clear button
 * - Responsive layout
 * - Accessible with ARIA labels
 *
 * Requirements: Issue #23 - Marketplace Listings
 */
export function MarketplaceFilters({
  projectTypes,
  selectedType,
  sortBy,
  searchQuery,
  onTypeChange,
  onSortChange,
  onSearchChange,
}: MarketplaceFiltersProps) {
  const handleTypeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      onTypeChange(value === '' ? null : (value as typeof selectedType));
    },
    [onTypeChange]
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

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          <Search className="h-4 w-4" aria-hidden="true" />
        </div>
        <Input
          type="search"
          placeholder="Search by project, seller, or location..."
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

      {/* Filters row */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Project type filter */}
        <div className="flex-1">
          <label htmlFor="project-type-filter" className="sr-only">
            Filter by project type
          </label>
          <Select
            id="project-type-filter"
            variant="primary"
            value={selectedType || ''}
            onChange={handleTypeChange}
            aria-label="Filter by project type"
          >
            <option value="">All Project Types</option>
            {projectTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
        </div>

        {/* Sort dropdown */}
        <div className="flex-1">
          <label htmlFor="sort-by" className="sr-only">
            Sort listings
          </label>
          <Select
            id="sort-by"
            variant="primary"
            value={sortBy}
            onChange={handleSortChange}
            aria-label="Sort listings"
          >
            <option value="date-newest">Newest First</option>
            <option value="date-oldest">Oldest First</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
          </Select>
        </div>
      </div>

      {/* Active filters indicator */}
      {(selectedType || searchQuery) && (
        <div className="flex items-center gap-2 flex-wrap">
          <Text variant="small" as="span" className="text-muted-foreground">
            Active filters:
          </Text>
          {selectedType && (
            <Button
              onClick={() => onTypeChange(null)}
              stellar="primary-outline"
              size="sm"
              className="h-7 text-xs"
              aria-label={`Remove ${selectedType} filter`}
            >
              {selectedType}
              <X className="ml-1 h-3 w-3" />
            </Button>
          )}
          {searchQuery && (
            <Button
              onClick={handleClearSearch}
              stellar="primary-outline"
              size="sm"
              className="h-7 text-xs"
              aria-label="Clear search filter"
            >
              Search: &quot;
              {searchQuery.length > 20 ? searchQuery.slice(0, 20) + '...' : searchQuery}
              &quot;
              <X className="ml-1 h-3 w-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
