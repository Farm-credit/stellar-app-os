'use client';

import { useState, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MarketplaceGrid } from '@/components/organisms/MarketplaceGrid/MarketplaceGrid';
import { MarketplaceFilters } from '@/components/molecules/MarketplaceFilters';
import { PaginationControl } from '@/components/molecules/PaginationControl';
import { Text } from '@/components/atoms/Text';
import { getMockMarketplaceListings } from '@/lib/api/mock/marketplaceListings';
import type { ProjectType, SortOption } from '@/lib/types/marketplace';

/**
 * Marketplace listings page
 *
 * Secondary market for carbon credits with:
 * - Grid of available credit listings (seller, quantity, price, project)
 * - Filter by project type
 * - Sort by price and date
 * - Search functionality
 * - Server-side pagination with URL params
 * - Responsive and accessible (WCAG 2.1 AA)
 *
 * Requirements: Issue #23 - Marketplace Listings
 */
function MarketplacePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Parse URL params
  const initialPage = parseInt(searchParams.get('page') || '1', 10);
  const initialType = (searchParams.get('type') as ProjectType) || null;
  const initialSort = (searchParams.get('sort') as SortOption) || 'date-newest';
  const initialSearch = searchParams.get('search') || '';

  // State
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [selectedType, setSelectedType] = useState<ProjectType | null>(initialType);
  const [sortBy, setSortBy] = useState<SortOption>(initialSort);
  const [searchQuery, setSearchQuery] = useState(initialSearch);

  // Fetch data based on current filters
  const data = useMemo(() => {
    return getMockMarketplaceListings({
      page: currentPage,
      projectType: selectedType,
      sortBy,
      searchQuery,
    });
  }, [currentPage, selectedType, sortBy, searchQuery]);

  // Update URL params
  const updateUrlParams = useCallback(
    (params: { page?: number; type?: ProjectType | null; sort?: SortOption; search?: string }) => {
      const newParams = new URLSearchParams();

      const page = params.page ?? currentPage;
      const type = params.type !== undefined ? params.type : selectedType;
      const sort = params.sort ?? sortBy;
      const search = params.search !== undefined ? params.search : searchQuery;

      if (page > 1) newParams.set('page', page.toString());
      if (type) newParams.set('type', type);
      if (sort !== 'date-newest') newParams.set('sort', sort);
      if (search) newParams.set('search', search);

      const queryString = newParams.toString();
      const newUrl = queryString ? `/marketplace?${queryString}` : '/marketplace';
      router.push(newUrl, { scroll: false });
    },
    [currentPage, selectedType, sortBy, searchQuery, router]
  );

  // Handlers
  const handleTypeChange = useCallback(
    (type: ProjectType | null) => {
      setSelectedType(type);
      setCurrentPage(1);
      updateUrlParams({ type, page: 1 });
    },
    [updateUrlParams]
  );

  const handleSortChange = useCallback(
    (sort: SortOption) => {
      setSortBy(sort);
      setCurrentPage(1);
      updateUrlParams({ sort, page: 1 });
    },
    [updateUrlParams]
  );

  const handleSearchChange = useCallback(
    (search: string) => {
      setSearchQuery(search);
      setCurrentPage(1);
      updateUrlParams({ search, page: 1 });
    },
    [updateUrlParams]
  );

  return (
    <main className="container mx-auto px-4 py-8 max-w-7xl">
      {/* Header */}
      <header className="mb-8">
        <Text variant="h2" as="h1" className="mb-2">
          Carbon Credit Marketplace
        </Text>
        <Text variant="muted" as="p">
          Browse and purchase carbon credits from verified sellers on the secondary market
        </Text>
      </header>

      {/* Filters */}
      <div className="mb-8">
        <MarketplaceFilters
          projectTypes={data.projectTypes}
          selectedType={selectedType}
          sortBy={sortBy}
          searchQuery={searchQuery}
          onTypeChange={handleTypeChange}
          onSortChange={handleSortChange}
          onSearchChange={handleSearchChange}
        />
      </div>

      {/* Results count */}
      <div className="mb-6">
        <Text variant="muted" as="p" aria-live="polite">
          {data.pagination.totalListings === 0
            ? 'No listings found'
            : `Showing ${data.listings.length} of ${data.pagination.totalListings} ${
                data.pagination.totalListings === 1 ? 'listing' : 'listings'
              }`}
        </Text>
      </div>

      {/* Listings grid */}
      <MarketplaceGrid
        listings={data.listings}
        currentUserId={null} // TODO: Replace with actual user ID from auth context
      />

      {/* Pagination */}
      {data.pagination.totalPages > 1 && (
        <div className="mt-8">
          <PaginationControl
            currentPage={data.pagination.currentPage}
            totalPages={data.pagination.totalPages}
            currentCategory={null}
          />
        </div>
      )}
    </main>
  );
}

export default function MarketplacePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <MarketplacePageContent />
    </Suspense>
  );
}
