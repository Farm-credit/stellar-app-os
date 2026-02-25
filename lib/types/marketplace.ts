/**
 * TypeScript type definitions for marketplace listings
 *
 * This file contains all type definitions for the marketplace feature including:
 * - MarketplaceListing: Core listing data structure
 * - MarketplaceListResponse: API response for marketplace listings
 * - Component prop interfaces for marketplace components
 *
 * Requirements: Issue #23 - Marketplace Listings
 */

export type ProjectType =
  | 'Reforestation'
  | 'Renewable Energy'
  | 'Mangrove Restoration'
  | 'Sustainable Agriculture'
  | 'Other';

export type VerificationStatus =
  | 'Gold Standard'
  | 'Verra (VCS)'
  | 'Climate Action Reserve'
  | 'Plan Vivo'
  | 'Pending';

export type SortOption = 'price-asc' | 'price-desc' | 'date-newest' | 'date-oldest';

/**
 * Core marketplace listing data structure
 */
export interface MarketplaceListing {
  /** Unique identifier for the listing */
  id: string;

  /** Seller's public key or identifier */
  sellerId: string;

  /** Seller's display name */
  sellerName: string;

  /** Project name */
  projectName: string;

  /** Project type/category */
  projectType: ProjectType;

  /** Quantity of credits available (in tons CO₂) */
  quantity: number;

  /** Price per ton in USD */
  pricePerTon: number;

  /** Total price for all credits */
  totalPrice: number;

  /** Vintage year of the credits */
  vintageYear: number;

  /** Verification standard */
  verificationStatus: VerificationStatus;

  /** ISO 8601 date string when the listing was created */
  listedAt: string;

  /** Project location */
  location: string;

  /** Whether the listing is still active */
  isActive: boolean;
}

/**
 * API response structure for marketplace listings endpoint
 */
export interface MarketplaceListResponse {
  /** Array of marketplace listings */
  listings: MarketplaceListing[];

  /** Pagination metadata */
  pagination: {
    /** Current page number (1-indexed) */
    currentPage: number;

    /** Total number of pages */
    totalPages: number;

    /** Total number of listings across all pages */
    totalListings: number;

    /** Number of listings per page */
    listingsPerPage: number;
  };

  /** Array of all available project types */
  projectTypes: ProjectType[];
}

/**
 * Props for MarketplaceGrid component
 */
export interface MarketplaceGridProps {
  /** Array of marketplace listings to display */
  listings: MarketplaceListing[];

  /** Current user's ID to identify own listings */
  currentUserId?: string | null;
}

/**
 * Props for ListingCard component
 */
export interface ListingCardProps {
  /** Marketplace listing data to display */
  listing: MarketplaceListing;

  /** Whether this listing belongs to the current user */
  isOwnListing?: boolean;
}

/**
 * Props for MarketplaceFilters component
 */
export interface MarketplaceFiltersProps {
  /** Array of available project types */
  projectTypes: ProjectType[];

  /** Currently selected project type (null means "All") */
  selectedType: ProjectType | null;

  /** Current sort option */
  sortBy: SortOption;

  /** Current search query */
  searchQuery: string;

  /** Callback when project type filter changes */
  // eslint-disable-next-line no-unused-vars
  onTypeChange: (type: ProjectType | null) => void;

  /** Callback when sort option changes */
  // eslint-disable-next-line no-unused-vars
  onSortChange: (sort: SortOption) => void;

  /** Callback when search query changes */
  // eslint-disable-next-line no-unused-vars
  onSearchChange: (query: string) => void;
}
