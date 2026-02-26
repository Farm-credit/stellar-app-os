'use client';

import { ListingCard } from '@/components/molecules/ListingCard';
import { Text } from '@/components/atoms/Text';
import type { MarketplaceGridProps } from '@/lib/types/marketplace';

/**
 * MarketplaceGrid organism component
 *
 * Renders a responsive CSS Grid of ListingCard components.
 * Includes an empty state for zero listings and an aria-live region
 * so screen readers announce content changes on filter/sort/pagination.
 *
 * Requirements: Issue #23 - Marketplace Listings
 */
export function MarketplaceGrid({ listings, currentUserId }: MarketplaceGridProps) {
  return (
    <section aria-label="Marketplace listings" aria-live="polite" aria-atomic="false">
      {listings.length === 0 ? (
        <EmptyState />
      ) : (
        <ul
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 list-none p-0"
          role="list"
        >
          {listings.map((listing) => (
            <li key={listing.id}>
              <ListingCard listing={listing} isOwnListing={currentUserId === listing.sellerId} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Empty state displayed when no listings match the current filters.
 */
function EmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center py-24 text-center"
      role="status"
      aria-live="polite"
    >
      {/* Decorative icon */}
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-stellar-blue/10">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-10 w-10 text-stellar-blue"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
          />
        </svg>
      </div>

      <Text variant="h3" as="h2" className="mb-2">
        No listings found
      </Text>
      <Text variant="muted" as="p" className="max-w-sm">
        There are no marketplace listings matching your current filters. Try adjusting your search
        or filters.
      </Text>
    </div>
  );
}
