'use client';

import { useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MarketplaceGrid } from '@/components/organisms/MarketplaceGrid/MarketplaceGrid';
import { MarketplaceFilters } from '@/components/molecules/MarketplaceFilters';
import { PaginationControl } from '@/components/molecules/PaginationControl';
import { Text } from '@/components/atoms/Text';
import { getMockMarketplaceListings } from '@/lib/api/mock/marketplaceListings';
import type { FundingStatus, ProjectType, SortOption } from '@/lib/types/marketplace';
import { CertificationFilter } from '@/components/marketplace/CertificationFilter';
import { credentialsForListing } from '@/lib/services/farmer-credentials';
import type { SustainabilityCertification } from '@/lib/types/issue-1374-1377';

const SORT_OPTIONS: SortOption[] = [
  'date-newest',
  'date-oldest',
  'price-asc',
  'price-desc',
  'alphabetical',
  'funded',
  'ending-soon',
];

const FUNDING_STATUS_OPTIONS: FundingStatus[] = ['Open', 'Closing Soon', 'Fully Funded'];

function normalizePage(page?: string | null) {
  const parsed = Number(page);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function normalizeSort(sort?: string | null): SortOption {
  if (SORT_OPTIONS.includes(sort as SortOption)) {
    return sort as SortOption;
  }

  return 'date-newest';
}

function normalizeFundingStatus(status?: string | null): FundingStatus | null {
  if (FUNDING_STATUS_OPTIONS.includes(status as FundingStatus)) {
    return status as FundingStatus;
  }

  return null;
}

function MarketplacePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentPage = normalizePage(searchParams.get('page'));
  const selectedType = (searchParams.get('type') as ProjectType) || null;
  const selectedLocation = searchParams.get('location') || null;
  const selectedFundingStatus = normalizeFundingStatus(searchParams.get('fundingStatus'));
  const selectedCertification =
    (searchParams.get('certification') as SustainabilityCertification) || null;
  const sortBy = normalizeSort(searchParams.get('sort'));
  const searchQuery = searchParams.get('search') || '';

  const data = useMemo(
    () =>
      getMockMarketplaceListings({
        page: currentPage,
        projectType: selectedType,
        sortBy,
        searchQuery,
        location: selectedLocation,
        fundingStatus: selectedFundingStatus,
      }),
    [currentPage, selectedType, sortBy, searchQuery, selectedLocation, selectedFundingStatus]
  );

  const certificationFilteredListings = useMemo(
    () =>
      selectedCertification
        ? data.listings.filter((listing) =>
            credentialsForListing(listing.sellerId).some((farmer) =>
              farmer.certifications.includes(selectedCertification)
            )
          )
        : data.listings,
    [data.listings, selectedCertification]
  );
  const activeFilterCount = useMemo(
    () =>
      [
        selectedType,
        selectedLocation,
        selectedFundingStatus,
        selectedCertification,
        searchQuery,
      ].filter(Boolean).length,
    [selectedType, selectedLocation, selectedFundingStatus, selectedCertification, searchQuery]
  );

  const updateUrlParams = useCallback(
    (params: {
      page?: number;
      type?: ProjectType | null;
      location?: string | null;
      fundingStatus?: FundingStatus | null;
      sort?: SortOption;
      search?: string;
      certification?: SustainabilityCertification | null;
    }) => {
      const newParams = new URLSearchParams();

      const page = params.page ?? currentPage;
      const type = params.type !== undefined ? params.type : selectedType;
      const location = params.location !== undefined ? params.location : selectedLocation;
      const fundingStatus =
        params.fundingStatus !== undefined ? params.fundingStatus : selectedFundingStatus;
      const sort = params.sort ?? sortBy;
      const search = params.search !== undefined ? params.search : searchQuery;
      const certification =
        params.certification !== undefined ? params.certification : selectedCertification;

      if (page > 1) newParams.set('page', page.toString());
      if (type) newParams.set('type', type);
      if (location) newParams.set('location', location);
      if (fundingStatus) newParams.set('fundingStatus', fundingStatus);
      if (sort !== 'date-newest') newParams.set('sort', sort);
      if (search) newParams.set('search', search);
      if (certification) newParams.set('certification', certification);

      const queryString = newParams.toString();
      const newUrl = queryString ? `/marketplace?${queryString}` : '/marketplace';
      router.push(newUrl, { scroll: false });
    },
    [
      currentPage,
      selectedType,
      selectedLocation,
      selectedFundingStatus,
      sortBy,
      searchQuery,
      selectedCertification,
      router,
    ]
  );

  const handleTypeChange = useCallback(
    (type: ProjectType | null) => {
      updateUrlParams({ type, page: 1 });
    },
    [updateUrlParams]
  );

  const handleLocationChange = useCallback(
    (location: string | null) => {
      updateUrlParams({ location, page: 1 });
    },
    [updateUrlParams]
  );

  const handleFundingStatusChange = useCallback(
    (status: FundingStatus | null) => {
      updateUrlParams({ fundingStatus: status, page: 1 });
    },
    [updateUrlParams]
  );

  const handleCertificationChange = useCallback(
    (certification: SustainabilityCertification | null) =>
      updateUrlParams({ certification, page: 1 }),
    [updateUrlParams]
  );
  const handleSortChange = useCallback(
    (sort: SortOption) => {
      updateUrlParams({ sort, page: 1 });
    },
    [updateUrlParams]
  );

  const handleSearchChange = useCallback(
    (search: string) => {
      updateUrlParams({ search, page: 1 });
    },
    [updateUrlParams]
  );

  const handleClearAllFilters = useCallback(() => {
    updateUrlParams({
      page: 1,
      type: null,
      location: null,
      fundingStatus: null,
      certification: null,
      search: '',
      sort: 'date-newest',
    });
  }, [updateUrlParams]);

  return (
    <main className="container mx-auto px-4 py-8 max-w-7xl">
      <header className="mb-8">
        <Text variant="h2" as="h1" className="mb-2">
          Carbon Credit Marketplace
        </Text>
        <Text variant="muted" as="p">
          Browse verified agricultural credit listings with shareable filter URLs and sorting
          options.
        </Text>
      </header>

      <div className="grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside>
          <MarketplaceFilters
            projectTypes={data.projectTypes}
            locations={data.locations}
            fundingStatuses={data.fundingStatuses}
            selectedType={selectedType}
            selectedLocation={selectedLocation}
            selectedFundingStatus={selectedFundingStatus}
            sortBy={sortBy}
            searchQuery={searchQuery}
            activeFilterCount={activeFilterCount}
            onTypeChange={handleTypeChange}
            onLocationChange={handleLocationChange}
            onFundingStatusChange={handleFundingStatusChange}
            onSortChange={handleSortChange}
            onSearchChange={handleSearchChange}
            onClearAllFilters={handleClearAllFilters}
          />
          <div className="mt-4 rounded-3xl border border-border bg-background p-4 lg:p-6">
            <CertificationFilter
              value={selectedCertification}
              onChange={handleCertificationChange}
            />
          </div>
        </aside>

        <section className="space-y-6">
          <div className="rounded-3xl border border-border bg-background p-6">
            <Text variant="small" className="text-muted-foreground">
              {data.pagination.totalListings === 0
                ? 'No listings match your filters.'
                : `Showing ${certificationFilteredListings.length} of ${data.pagination.totalListings} listings`}
            </Text>
          </div>

          <MarketplaceGrid listings={certificationFilteredListings} currentUserId={null} />

          {data.pagination.totalPages > 1 && (
            <div className="mt-8">
              <PaginationControl
                currentPage={data.pagination.currentPage}
                totalPages={data.pagination.totalPages}
                currentCategory={null}
              />
            </div>
          )}
        </section>
      </div>
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
