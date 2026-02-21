export interface ProjectDetails {
  id: string;
  name: string;
  type: string;
  vintage: number;
}

export interface PriceHistoryPoint {
  date: string; // ISO string
  price: number;
}

export interface Listing {
  id: string;
  sellerAddress: string;
  pricePerCredit: number;
  availableQuantity: number;
  project: ProjectDetails;
  priceHistory?: PriceHistoryPoint[];
}
