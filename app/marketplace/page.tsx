'use client';

import { useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MarketplaceGrid } from '@/components/organisms/MarketplaceGrid/MarketplaceGrid';
import { MarketplaceNewsFeed } from '@/components/organisms/MarketplaceNewsFeed/MarketplaceNewsFeed';
import { MarketplaceFilters } from '@/components/molecules/MarketplaceFilters';
import { PaginationControl } from '@/components/molecules/PaginationControl';
import { Text } from '@/components/atoms/Text';
import { Button } from '@/components/atoms/Button';
import Link from 'next/link';
import { getMockMarketplaceListings } from '@/lib/api/mock/marketplaceListings';
import type { FundingStatus, ProjectType, SortOption } from '@/lib/types/marketplace';
import { CertificationFilter } from '@/components/marketplace/CertificationFilter';
import { credentialsForListing } from '@/lib/services/farmer-credentials';
import type { SustainabilityCertification } from '@/lib/types/issue-1374-1377';
import { HistoricalCarbonTrends } from '@/components/marketplace/HistoricalCarbonTrends';
import { useHistoricalCarbonData } from '@/lib/hooks/useHistoricalCarbonData';
import type { CertificationProvider } from '@/lib/types/certification-integration';

type ListingKind = 'fixed' | 'auction';
const LISTING_KIND_OPTIONS: ListingKind[] = ['fixed', 'auction'];
const CERTIFICATION_PROVIDERS: CertificationProvider[] = ['verra', 'gold-standard'];

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

function normalizeListingKind(kind?: string | null): ListingKind | null {
  if (LISTING_KIND_OPTIONS.includes(kind as ListingKind)) {
    return kind as ListingKind;
  }

  return null;
}

function normalizeCertificationProvider(provider?: string | null): CertificationProvider | null {
  if (CERTIFICATION_PROVIDERS.includes(provider as CertificationProvider)) {
    return provider as CertificationProvider;
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
  const selectedListingKind = normalizeListingKind(searchParams.get('kind'));
  const selectedCertificationProvider = normalizeCertificationProvider(
    searchParams.get('provider')
  );

  const historical = useHistoricalCarbonData({
    projectType: selectedType,
    region: selectedLocation,
  });

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

  const certificationFilteredListings = useMemo(() => {
    let listings = data.listings;

    if (selectedCertification) {
      listings = listings.filter((listing) =>
        credentialsForListing(listing.sellerId).some((farmer) =>
          farmer.certifications.includes(selectedCertification)
        )
      );
    }

    if (selectedListingKind) {
      listings = listings.filter((listing) => {
        const kind = (listing as { listingKind?: ListingKind }).listingKind ?? 'fixed';
        return kind === selectedListingKind;
      });
    }

    if (selectedCertificationProvider) {
      listings = listings.filter((listing) => {
        const provider = (listing as { certificationProvider?: CertificationProvider })
          .certificationProvider;
        return provider === selectedCertificationProvider;
      });
    }

    return listings;
  }, [data.listings, selectedCertification, selectedListingKind, selectedCertificationProvider]);
  const activeFilterCount = useMemo(
    () =>
      [
        selectedType,
        selectedLocation,
        selectedFundingStatus,
        selectedCertification,
        selectedListingKind,
        selectedCertificationProvider,
        searchQuery,
      ].filter(Boolean).length,
    [
      selectedType,
      selectedLocation,
      selectedFundingStatus,
      selectedCertification,
      selectedListingKind,
      selectedCertificationProvider,
      searchQuery,
    ]
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
      kind?: ListingKind | null;
      provider?: CertificationProvider | null;
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
      const kind = params.kind !== undefined ? params.kind : selectedListingKind;
      const provider =
        params.provider !== undefined ? params.provider : selectedCertificationProvider;

      if (page > 1) newParams.set('page', page.toString());
      if (type) newParams.set('type', type);
      if (location) newParams.set('location', location);
      if (fundingStatus) newParams.set('fundingStatus', fundingStatus);
      if (sort !== 'date-newest') newParams.set('sort', sort);
      if (search) newParams.set('search', search);
      if (certification) newParams.set('certification', certification);
      if (kind) newParams.set('kind', kind);
      if (provider) newParams.set('provider', provider);

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
      selectedListingKind,
      selectedCertificationProvider,
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

  const handleListingKindChange = useCallback(
    (kind: ListingKind | null) => updateUrlParams({ kind, page: 1 }),
    [updateUrlParams]
  );

  const handleCertificationProviderChange = useCallback(
    (provider: CertificationProvider | null) => updateUrlParams({ provider, page: 1 }),
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
      kind: null,
      provider: null,
      search: '',
      sort: 'date-newest',
    });
  }, [updateUrlParams]);

  return (
    <main className="container mx-auto px-4 py-8 max-w-7xl">
      <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <Text variant="h2" as="h1" className="mb-2">
            Carbon Credit Marketplace
          </Text>
          <Text variant="muted" as="p">
            Browse verified agricultural credit listings with shareable filter URLs and sorting
            options.
          </Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/marketplace/corporate">
            <Button variant="outline" size="sm" className="text-xs cursor-pointer">
              🏢 Corporate Program
            </Button>
          </Link>
          <Link href="/projects/map">
            <Button variant="outline" size="sm" className="text-xs cursor-pointer">
              🗺 Offset Map
            </Button>
          </Link>
          <Link href="/marketplace/auctions/new">
            <Button variant="outline" size="sm" className="text-xs cursor-pointer">
              🔨 Create Auction
            </Button>
          </Link>
          <Link href="/marketplace/bulk">
            <Button size="sm" className="text-xs cursor-pointer">
              Bulk Purchasing &rarr;
            </Button>
          </Link>
        </div>
      </header>

      <MarketplaceNewsFeed />

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
            <div className="mt-4 space-y-3">
              <Text variant="small" className="font-medium">
                Listing type
              </Text>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={selectedListingKind === null ? 'primary' : 'outline'}
                  size="sm"
                  className="text-xs cursor-pointer"
                  onClick={() => handleListingKindChange(null)}
                >
                  All
                </Button>
                <Button
                  variant={selectedListingKind === 'fixed' ? 'primary' : 'outline'}
                  size="sm"
                  className="text-xs cursor-pointer"
                  onClick={() => handleListingKindChange('fixed')}
                >
                  Fixed price
                </Button>
                <Button
                  variant={selectedListingKind === 'auction' ? 'primary' : 'outline'}
                  size="sm"
                  className="text-xs cursor-pointer"
                  onClick={() => handleListingKindChange('auction')}
                >
                  Auctions
                </Button>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              <Text variant="small" className="font-medium">
                Certification provider
              </Text>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={selectedCertificationProvider === null ? 'primary' : 'outline'}
                  size="sm"
                  className="text-xs cursor-pointer"
                  onClick={() => handleCertificationProviderChange(null)}
                >
                  All
                </Button>
                <Button
                  variant={selectedCertificationProvider === 'verra' ? 'primary' : 'outline'}
                  size="sm"
                  className="text-xs cursor-pointer"
                  onClick={() => handleCertificationProviderChange('verra')}
                >
                  Verra
                </Button>
                <Button
                  variant={
                    selectedCertificationProvider === 'gold-standard' ? 'primary' : 'outline'
                  }
                  size="sm"
                  className="text-xs cursor-pointer"
                  onClick={() => handleCertificationProviderChange('gold-standard')}
                >
                  Gold Standard
                </Button>
              </div>
            </div>
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

          <HistoricalCarbonTrends
            priceHistory={historical.priceHistory}
            buyerTrends={historical.buyerTrends}
            isLoading={historical.isLoading}
            error={historical.error}
            projectType={selectedType}
            region={selectedLocation}
          />

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
