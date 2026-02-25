import type {
  MarketplaceListing,
  MarketplaceListResponse,
  ProjectType,
  SortOption,
} from '@/lib/types/marketplace';

/**
 * Mock marketplace listings data
 * Simulates a secondary market for carbon credits
 */
const mockListings: MarketplaceListing[] = [
  {
    id: 'listing-001',
    sellerId: 'seller-alice',
    sellerName: 'Alice Green',
    projectName: 'Amazon Rainforest Reforestation',
    projectType: 'Reforestation',
    quantity: 50.5,
    pricePerTon: 42.0,
    totalPrice: 2121.0,
    vintageYear: 2023,
    verificationStatus: 'Gold Standard',
    listedAt: '2024-02-15T10:30:00Z',
    location: 'Brazil, Amazon Basin',
    isActive: true,
  },
  {
    id: 'listing-002',
    sellerId: 'seller-bob',
    sellerName: 'Bob Martinez',
    projectName: 'Wind Energy Farm - Texas',
    projectType: 'Renewable Energy',
    quantity: 100.0,
    pricePerTon: 35.5,
    totalPrice: 3550.0,
    vintageYear: 2024,
    verificationStatus: 'Verra (VCS)',
    listedAt: '2024-02-18T14:20:00Z',
    location: 'Texas, USA',
    isActive: true,
  },
  {
    id: 'listing-003',
    sellerId: 'seller-carol',
    sellerName: 'Carol Chen',
    projectName: 'Mangrove Restoration - Indonesia',
    projectType: 'Mangrove Restoration',
    quantity: 75.25,
    pricePerTon: 52.0,
    totalPrice: 3913.0,
    vintageYear: 2024,
    verificationStatus: 'Plan Vivo',
    listedAt: '2024-02-20T09:15:00Z',
    location: 'Indonesia, Coastal Regions',
    isActive: true,
  },
  {
    id: 'listing-004',
    sellerId: 'seller-david',
    sellerName: 'David Kumar',
    projectName: 'Solar Power Initiative - India',
    projectType: 'Renewable Energy',
    quantity: 120.0,
    pricePerTon: 38.75,
    totalPrice: 4650.0,
    vintageYear: 2023,
    verificationStatus: 'Climate Action Reserve',
    listedAt: '2024-02-10T16:45:00Z',
    location: 'Rural India',
    isActive: true,
  },
  {
    id: 'listing-005',
    sellerId: 'seller-emma',
    sellerName: 'Emma Wilson',
    projectName: 'Sustainable Agriculture - Kenya',
    projectType: 'Sustainable Agriculture',
    quantity: 30.0,
    pricePerTon: 33.0,
    totalPrice: 990.0,
    vintageYear: 2022,
    verificationStatus: 'Gold Standard',
    listedAt: '2024-02-22T11:00:00Z',
    location: 'Kenya, East Africa',
    isActive: true,
  },
  {
    id: 'listing-006',
    sellerId: 'seller-frank',
    sellerName: "Frank O'Brien",
    projectName: 'Amazon Rainforest Reforestation',
    projectType: 'Reforestation',
    quantity: 85.0,
    pricePerTon: 44.5,
    totalPrice: 3782.5,
    vintageYear: 2023,
    verificationStatus: 'Gold Standard',
    listedAt: '2024-02-12T08:30:00Z',
    location: 'Brazil, Amazon Basin',
    isActive: true,
  },
  {
    id: 'listing-007',
    sellerId: 'seller-grace',
    sellerName: 'Grace Tanaka',
    projectName: 'Wind Energy Farm - Scotland',
    projectType: 'Renewable Energy',
    quantity: 60.0,
    pricePerTon: 40.0,
    totalPrice: 2400.0,
    vintageYear: 2024,
    verificationStatus: 'Verra (VCS)',
    listedAt: '2024-02-19T13:20:00Z',
    location: 'Scotland, UK',
    isActive: true,
  },
  {
    id: 'listing-008',
    sellerId: 'seller-henry',
    sellerName: 'Henry Patel',
    projectName: 'Mangrove Restoration - Bangladesh',
    projectType: 'Mangrove Restoration',
    quantity: 45.5,
    pricePerTon: 50.0,
    totalPrice: 2275.0,
    vintageYear: 2023,
    verificationStatus: 'Plan Vivo',
    listedAt: '2024-02-16T10:10:00Z',
    location: 'Bangladesh, Coastal Regions',
    isActive: true,
  },
  {
    id: 'listing-009',
    sellerId: 'seller-isabel',
    sellerName: 'Isabel Rodriguez',
    projectName: 'Sustainable Agriculture - Peru',
    projectType: 'Sustainable Agriculture',
    quantity: 55.0,
    pricePerTon: 36.0,
    totalPrice: 1980.0,
    vintageYear: 2024,
    verificationStatus: 'Gold Standard',
    listedAt: '2024-02-21T15:30:00Z',
    location: 'Peru, Andes Region',
    isActive: true,
  },
  {
    id: 'listing-010',
    sellerId: 'seller-jack',
    sellerName: 'Jack Thompson',
    projectName: 'Solar Power Initiative - Australia',
    projectType: 'Renewable Energy',
    quantity: 95.0,
    pricePerTon: 37.25,
    totalPrice: 3538.75,
    vintageYear: 2024,
    verificationStatus: 'Climate Action Reserve',
    listedAt: '2024-02-14T12:00:00Z',
    location: 'Queensland, Australia',
    isActive: true,
  },
  {
    id: 'listing-011',
    sellerId: 'seller-karen',
    sellerName: 'Karen Lee',
    projectName: 'Reforestation - Vietnam',
    projectType: 'Reforestation',
    quantity: 40.0,
    pricePerTon: 41.0,
    totalPrice: 1640.0,
    vintageYear: 2023,
    verificationStatus: 'Verra (VCS)',
    listedAt: '2024-02-17T09:45:00Z',
    location: 'Vietnam, Central Highlands',
    isActive: true,
  },
  {
    id: 'listing-012',
    sellerId: 'seller-leo',
    sellerName: 'Leo Nguyen',
    projectName: 'Wind Energy Farm - Denmark',
    projectType: 'Renewable Energy',
    quantity: 110.0,
    pricePerTon: 39.0,
    totalPrice: 4290.0,
    vintageYear: 2024,
    verificationStatus: 'Gold Standard',
    listedAt: '2024-02-13T14:15:00Z',
    location: 'Denmark, North Sea',
    isActive: true,
  },
];

/**
 * Filters listings by project type
 */
function filterByType(
  listings: MarketplaceListing[],
  type: ProjectType | null
): MarketplaceListing[] {
  if (!type) return listings;
  return listings.filter((listing) => listing.projectType === type);
}

/**
 * Filters listings by search query (searches project name, seller name, and location)
 */
function filterBySearch(listings: MarketplaceListing[], query: string): MarketplaceListing[] {
  if (!query.trim()) return listings;

  const lowerQuery = query.toLowerCase().trim();
  return listings.filter(
    (listing) =>
      listing.projectName.toLowerCase().includes(lowerQuery) ||
      listing.sellerName.toLowerCase().includes(lowerQuery) ||
      listing.location.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Sorts listings based on sort option
 */
function sortListings(listings: MarketplaceListing[], sortBy: SortOption): MarketplaceListing[] {
  const sorted = [...listings];

  switch (sortBy) {
    case 'price-asc':
      return sorted.sort((a, b) => a.pricePerTon - b.pricePerTon);
    case 'price-desc':
      return sorted.sort((a, b) => b.pricePerTon - a.pricePerTon);
    case 'date-newest':
      return sorted.sort((a, b) => new Date(b.listedAt).getTime() - new Date(a.listedAt).getTime());
    case 'date-oldest':
      return sorted.sort((a, b) => new Date(a.listedAt).getTime() - new Date(b.listedAt).getTime());
    default:
      return sorted;
  }
}

/**
 * Paginates listings
 */
function paginateListings(
  listings: MarketplaceListing[],
  page: number,
  perPage: number
): MarketplaceListing[] {
  const startIndex = (page - 1) * perPage;
  const endIndex = startIndex + perPage;
  return listings.slice(startIndex, endIndex);
}

/**
 * Fetches marketplace listings with filtering, sorting, and pagination
 * This is a mock implementation that simulates server-side data processing
 */
export function getMockMarketplaceListings(params: {
  page?: number;
  projectType?: ProjectType | null;
  sortBy?: SortOption;
  searchQuery?: string;
}): MarketplaceListResponse {
  const page = params.page || 1;
  const perPage = 9; // 3x3 grid
  const projectType = params.projectType || null;
  const sortBy = params.sortBy || 'date-newest';
  const searchQuery = params.searchQuery || '';

  // Apply filters
  let filteredListings = mockListings.filter((listing) => listing.isActive);
  filteredListings = filterByType(filteredListings, projectType);
  filteredListings = filterBySearch(filteredListings, searchQuery);

  // Apply sorting
  const sortedListings = sortListings(filteredListings, sortBy);

  // Calculate pagination
  const totalListings = sortedListings.length;
  const totalPages = Math.ceil(totalListings / perPage);
  const paginatedListings = paginateListings(sortedListings, page, perPage);

  // Get unique project types
  const projectTypes: ProjectType[] = Array.from(
    new Set(mockListings.map((listing) => listing.projectType))
  );

  return {
    listings: paginatedListings,
    pagination: {
      currentPage: page,
      totalPages,
      totalListings,
      listingsPerPage: perPage,
    },
    projectTypes,
  };
}
