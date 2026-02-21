import { Listing } from '../types/marketplace';

// Mock data generator for listings
const MOCK_LISTINGS: Record<string, Listing> = {
  '1': {
    id: '1',
    sellerAddress: '0x1234567890abcdef1234567890abcdef12345678',
    pricePerCredit: 12.5,
    availableQuantity: 500,
    project: {
      id: 'proj-1',
      name: 'Amazon Rainforest Reforestation',
      type: 'Nature-Based',
      vintage: 2022,
    },
    priceHistory: [
      { date: '2023-01-01T00:00:00Z', price: 10.0 },
      { date: '2023-06-01T00:00:00Z', price: 11.5 },
      { date: '2024-01-01T00:00:00Z', price: 12.0 },
      { date: '2024-02-01T00:00:00Z', price: 12.5 },
    ],
  },
  '2': {
    id: '2',
    sellerAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
    pricePerCredit: 15.0,
    availableQuantity: 100,
    project: {
      id: 'proj-2',
      name: 'Sahara Solar Farm Expansion',
      type: 'Renewable Energy',
      vintage: 2023,
    },
    // No price history for this one
  },
};

/**
 * Fetches a listing by its ID.
 * Returns null if the listing is not found.
 */
export async function getListingById(id: string): Promise<Listing | null> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 500));
  
  const listing = MOCK_LISTINGS[id];
  return listing || null;
}

/**
 * Checks if the requested quantity is available for the given listing.
 * Returns true if available, false otherwise.
 */
export async function checkAvailability(id: string, requestedQuantity: number): Promise<boolean> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 300));
  
  const listing = MOCK_LISTINGS[id];
  if (!listing) return false;
  
  return listing.availableQuantity >= requestedQuantity;
}
