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
  'Gold Standard' | 'Verra (VCS)' | 'Climate Action Reserve' | 'Plan Vivo' | 'Pending';

export type FundingStatus = 'Open' | 'Closing Soon' | 'Fully Funded';

export type SortOption =
  | 'price-asc'
  | 'price-desc'
  | 'date-newest'
  | 'date-oldest'
  | 'alphabetical'
  | 'funded'
  | 'ending-soon';

/**
 * Discriminator for the kind of marketplace listing
 */
export type ListingKind = 'fixed' | 'auction';

/**
 * Lifecycle status of an auction
 */
export type AuctionStatus = 'scheduled' | 'active' | 'ended' | 'cancelled' | 'settled';

/**
 * Status of an individual bid
 */
export type BidStatus = 'active' | 'outbid' | 'winning' | 'won' | 'lost' | 'withdrawn';

/**
 * Auction for carbon credits - competitive bidding with transparent price discovery
 */
export interface Auction {
  /** Unique identifier for the auction */
  id: string;

  /** Identifier of the underlying marketplace listing */
  listingId: string;

  /** Seller's public key or identifier */
  sellerId: string;

  /** Seller's display name */
  sellerName: string;

  /** Project name */
  projectName: string;

  /** Project type/category */
  projectType: ProjectType;

  /** Quantity of credits being auctioned (in tons CO₂) */
  quantity: number;

  /** Minimum acceptable bid per ton in USD (reserve price) */
  reservePrice: number;

  /** Current highest bid per ton in USD (null if no bids) */
  currentHighestBid: number | null;

  /** Number of bids placed */
  bidCount: number;

  /** Current auction status */
  status: AuctionStatus;

  /** ISO 8601 date string when the auction starts */
  startsAt: string;

  /** ISO 8601 date string when the auction ends */
  endsAt: string;

  /** Whether the reserve price has been met */
  reserveMet: boolean;

  /** Verification standard */
  verificationStatus: VerificationStatus;

  /** Vintage year of the credits */
  vintageYear: number;

  /** Project location */
  location: string;
}

/**
 * A single bid placed on an auction
 */
export interface Bid {
  /** Unique identifier for the bid */
  id: string;

  /** Identifier of the auction the bid belongs to */
  auctionId: string;

  /** Bidder's public key or identifier */
  bidderId: string;

  /** Bidder's display name */
  bidderName: string;

  /** Bid amount per ton in USD */
  bidPerTon: number;

  /** Total bid amount for the full quantity */
  totalAmount: number;

  /** Quantity of credits the bid covers (in tons CO₂) */
  quantity: number;

  /** Current status of the bid */
  status: BidStatus;

  /** ISO 8601 date string when the bid was placed */
  placedAt: string;
}

/**
 * Input for creating a new auction
 */
export interface CreateAuctionInput {
  /** Identifier of the listing to auction */
  listingId: string;

  /** Quantity of credits to auction (in tons CO₂) */
  quantity: number;

  /** Minimum acceptable bid per ton in USD */
  reservePrice: number;

  /** ISO 8601 date string when the auction should start */
  startsAt: string;

  /** ISO 8601 date string when the auction should end */
  endsAt: string;
}

/**
 * Input for placing a bid on an auction
 */
export interface PlaceBidInput {
  /** Identifier of the auction to bid on */
  auctionId: string;

  /** Bid amount per ton in USD */
  bidPerTon: number;

  /** Quantity of credits to bid on (in tons CO₂) */
  quantity: number;
}

/**
 * API response structure for auctions endpoint
 */
export interface AuctionListResponse {
  /** Array of auctions */
  auctions: Auction[];

  /** Pagination metadata */
  pagination: {
    /** Current page number (1-indexed) */
    currentPage: number;

    /** Total number of pages */
    totalPages: number;

    /** Total number of auctions across all pages */
    totalAuctions: number;

    /** Number of auctions per page */
    auctionsPerPage: number;
  };
}

/**
 * Result of resolving (settling) an auction
 */
export interface AuctionResolution {
  /** Identifier of the resolved auction */
  auctionId: string;

  /** Identifier of the winning bid (null if reserve not met) */
  winningBidId: string | null;

  /** Identifier of the winning bidder (null if reserve not met) */
  winnerId: string | null;

  /** Winning price per ton in USD (null if reserve not met) */
  winningPricePerTon: number | null;

  /** Whether the reserve price was met */
  reserveMet: boolean;

  /** ISO 8601 date string when the auction was resolved */
  resolvedAt: string;
}

/**
 * Granularity for historical carbon data queries
 */
export type HistoricalGranularity = 'day' | 'week' | 'month' | 'quarter' | 'year';

/**
 * Query parameters for historical carbon data
 */
export interface HistoricalCarbonQuery {
  /** ISO 8601 date string for the start of the range */
  from: string;

  /** ISO 8601 date string for the end of the range */
  to: string;

  /** Aggregation granularity */
  granularity: HistoricalGranularity;

  /** Optional region filter */
  region?: string;

  /** Optional project type filter */
  projectType?: ProjectType;
}

/**
 * A single historical price data point
 */
export interface HistoricalPricePoint {
  /** ISO 8601 date string for the data point */
  date: string;

  /** Average price per ton in USD */
  averagePrice: number;

  /** Minimum price per ton in USD */
  minPrice: number;

  /** Maximum price per ton in USD */
  maxPrice: number;

  /** Volume of credits traded (in tons CO₂) */
  volume: number;
}

/**
 * Historical performance data for a project
 */
export interface ProjectPerformancePoint {
  /** Project identifier */
  projectId: string;

  /** Project name */
  projectName: string;

  /** Project type/category */
  projectType: ProjectType;

  /** Region of the project */
  region: string;

  /** Credits issued (in tons CO₂) */
  creditsIssued: number;

  /** Credits retired (in tons CO₂) */
  creditsRetired: number;

  /** Average price per ton in USD */
  averagePrice: number;
}

/**
 * Historical buyer trend data point
 */
export interface BuyerTrendPoint {
  /** ISO 8601 date string for the data point */
  date: string;

  /** Region the trend applies to */
  region: string;

  /** Number of unique buyers */
  buyerCount: number;

  /** Volume purchased (in tons CO₂) */
  volume: number;

  /** Average purchase price per ton in USD */
  averagePrice: number;
}

/**
 * API response structure for historical carbon data endpoint
 */
export interface HistoricalCarbonResponse {
  /** Historical price series */
  prices: HistoricalPricePoint[];

  /** Per-project performance data */
  projectPerformance: ProjectPerformancePoint[];

  /** Buyer trend data */
  buyerTrends: BuyerTrendPoint[];

  /** Price breakdown keyed by region */
  byRegion: Record<string, HistoricalPricePoint[]>;

  /** Price breakdown keyed by project type */
  byProjectType: Record<ProjectType, HistoricalPricePoint[]>;
}

/**
 * Supported certification registry providers
 */
export type CertificationProviderName = 'Verra' | 'Gold Standard';

/**
 * Verification state of a certification record
 */
export type CertificationVerificationState =
  | 'unverified'
  | 'pending'
  | 'verified'
  | 'expired'
  | 'revoked';

/**
 * Summary of a certification renewal document
 */
export interface RenewalDocumentSummary {
  /** Unique identifier for the document */
  id: string;

  /** Display name of the document */
  name: string;

  /** Certification provider the document belongs to */
  provider: CertificationProviderName;

  /** ISO 8601 date string when the document was issued */
  issuedAt: string;

  /** ISO 8601 date string when the document expires */
  expiresAt: string;

  /** Whether the document is due for renewal */
  renewalDue: boolean;

  /** Current verification state */
  verificationState: CertificationVerificationState;
}

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

  /** Funding status for the listing */
  fundingStatus: FundingStatus;

  /** ISO 8601 date string when the listing was created */
  listedAt: string;

  /** ISO 8601 date string when the listing closes */
  closingAt: string;

  /** Project location */
  location: string;

  /** Whether the listing is still active */
  isActive: boolean;

  /** Discriminator for the kind of listing (fixed price or auction) */
  listingKind: ListingKind;

  /** Current highest bid per ton in USD (auction listings only) */
  currentHighestBid?: number | null;

  /** Number of bids placed (auction listings only) */
  bidCount?: number;

  /** ISO 8601 date string when the auction ends (auction listings only) */
  endsAt?: string;

  /** Whether the reserve price has been met (auction listings only) */
  reserveMet?: boolean;
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

  /** Array of available locations */
  locations: string[];

  /** Available funding statuses */
  fundingStatuses: FundingStatus[];
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

  /** Array of available locations */
  locations: string[];

  /** Array of available funding statuses */
  fundingStatuses: FundingStatus[];

  /** Currently selected project type (null means "All") */
  selectedType: ProjectType | null;

  /** Currently selected location (null means "All") */
  selectedLocation: string | null;

  /** Currently selected funding status (null means "All") */
  selectedFundingStatus: FundingStatus | null;

  /** Current sort option */
  sortBy: SortOption;

  /** Current search query */
  searchQuery: string;

  /** Number of active filters */
  activeFilterCount: number;

  /** Callback when project type filter changes */
  onTypeChange: (type: ProjectType | null) => void;

  /** Callback when location filter changes */
  onLocationChange: (location: string | null) => void;

  /** Callback when funding status filter changes */
  onFundingStatusChange: (status: FundingStatus | null) => void;

  /** Callback when sort option changes */
  onSortChange: (sort: SortOption) => void;

  /** Callback when search query changes */
  onSearchChange: (query: string) => void;

  /** Callback to clear all filters */
  onClearAllFilters: () => void;
}

export interface PriceHistoryPoint {
  date: string;
  price: number;
}
