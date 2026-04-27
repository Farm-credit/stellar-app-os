import type { MarketplaceListing as Listing } from '../types/marketplace';

const MOCK_LISTINGS: Record<string, Listing> = {
  '1': {
    id: '1',
    sellerId: 'GCXAMPLE1234567890ABCDEF',
    sellerName: 'GreenEarth Fund',
    projectName: 'Amazon Rainforest Reforestation',
    projectType: 'Reforestation',
    quantity: 500,
    pricePerTon: 12.5,
    totalPrice: 6250,
    vintageYear: 2022,
    verificationStatus: 'Verra (VCS)',
    listedAt: '2024-01-15T00:00:00Z',
    location: 'Amazon Basin, Brazil',
    isActive: true,
  },
  '2': {
    id: '2',
    sellerId: 'GCXAMPLE9876543210FEDCBA',
    sellerName: 'SolarVerde Corp',
    projectName: 'Sahara Solar Farm Expansion',
    projectType: 'Renewable Energy',
    quantity: 100,
    pricePerTon: 15.0,
    totalPrice: 1500,
    vintageYear: 2023,
    verificationStatus: 'Gold Standard',
    listedAt: '2024-02-01T00:00:00Z',
    location: 'Sahara Desert, Morocco',
    isActive: true,
  },
};

export async function getListingById(id: string): Promise<Listing | null> {
  await new Promise((resolve) => setTimeout(resolve, 500));
  return MOCK_LISTINGS[id] ?? null;
}

export async function checkAvailability(id: string, requestedQuantity: number): Promise<boolean> {
  await new Promise((resolve) => setTimeout(resolve, 300));
  const listing = MOCK_LISTINGS[id];
  if (!listing) return false;
  return listing.quantity >= requestedQuantity;
}
