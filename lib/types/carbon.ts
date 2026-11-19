import type { NetworkType } from '@/lib/types/wallet';

export type ProjectType =
  | 'Reforestation'
  | 'Renewable Energy'
  | 'Mangrove Restoration'
  | 'Sustainable Agriculture'
  | 'Other';

/** Minimum quantity (in tonnes) required for a bulk-purchase order. */
export const BULK_PURCHASE_MIN_QUANTITY = 100;

/** Where to store corporate metadata for a bulk purchase. */
export type MetadataStorageType = 'none' | 'on-chain' | 'ipfs';

export type VerificationStatus =
  'Gold Standard' | 'Verra (VCS)' | 'Climate Action Reserve' | 'Plan Vivo' | 'Pending';

export interface ProjectCoordinates {
  latitude: number;
  longitude: number;
}

export interface CarbonProject {
  id: string;
  name: string;
  description: string;
  vintageYear: number;
  pricePerTon: number;
  availableSupply: number;
  isOutOfStock: boolean;
  type: ProjectType;
  location: string;
  coordinates: ProjectCoordinates;
  coBenefits: string[];
  verificationStatus: VerificationStatus;
}

export interface CreditSelectionState {
  projectId: string | null;
  quantity: number;
  calculatedPrice: number;
}

export interface CreditSelectionProps {
  projects: CarbonProject[];
  onSelectionChange?: (selection: CreditSelectionState) => void;
}

export interface CorporateMetadata {
  companyName: string;
  initiativeDescription: string;
  initiativeUrl?: string;
  storageType: MetadataStorageType;
  storageRef?: string;
}

export interface SpeciesRate {
  slug: string;
  co2ScaledX100: number;
  maturityYears: number;
  updatedAt: number;
}

export interface OffsetEstimate {
  slug: string;
  ageYears: number;
  gramsOffset: bigint;
  kgOffset: number;
}

export interface SponsorOffset {
  sponsor: string;
  totalGrams: bigint;
  totalKg: number;
}

export interface BulkPurchaseOrder {
  projectId: string;
  quantity: number;
  totalPrice: number;
  buyerPublicKey: string;
  network: NetworkType;
  metadata?: CorporateMetadata;
}

export interface BulkPurchaseResult {
  transactionXdr: string;
  networkPassphrase: string;
  ipfsCid?: string;
  memoValue?: string;
}

export interface AirdropRecipient {
  userId: string;
  walletAddress: string;
  email: string;
  joinedAt: string;
}

export interface AirdropRequest {
  creditsPerSponsor: number;
  projectId: string;
  platformLaunchDate: string;
}

export interface AirdropPreview {
  recipients: AirdropRecipient[];
  totalCredits: number;
  cutoffDate: string;
}

export interface AirdropResult {
  totalQueued: number;
  recipients: { walletAddress: string; status: 'queued' | 'skipped' }[];
}

/** Time bucket granularity for historical carbon data aggregation. */
export type HistoricalGranularity = 'day' | 'week' | 'month' | 'quarter' | 'year';

/** Query parameters for the historical carbon data API. */
export interface HistoricalCarbonQuery {
  /** ISO 8601 date string (inclusive lower bound). */
  startDate: string;
  /** ISO 8601 date string (inclusive upper bound). */
  endDate: string;
  granularity: HistoricalGranularity;
  /** Optional region filter (e.g. "Latin America", "Southeast Asia"). */
  region?: string;
  /** Optional project type filter. */
  projectType?: ProjectType;
}

/** A single aggregated price data point in a historical series. */
export interface HistoricalPricePoint {
  /** ISO 8601 timestamp marking the start of the bucket. */
  timestamp: string;
  /** Average price per ton across matching projects. */
  averagePrice: number;
  /** Minimum price per ton observed in the bucket. */
  minPrice: number;
  /** Maximum price per ton observed in the bucket. */
  maxPrice: number;
  /** Total volume (in tonnes) traded in the bucket. */
  volume: number;
}

/** Historical carbon price series, optionally broken down by project type. */
export interface HistoricalPriceSeries {
  /** Aggregated series across all matching projects. */
  overall: HistoricalPricePoint[];
  /** Per-project-type breakdown of the price series. */
  byProjectType: Partial<Record<ProjectType, HistoricalPricePoint[]>>;
}

/** Historical performance metrics for a single project. */
export interface HistoricalProjectPerformance {
  projectId: string;
  projectName: string;
  projectType: ProjectType;
  region: string;
  /** Total credits (in tonnes) sold within the queried range. */
  totalVolume: number;
  /** Total revenue (in the project's pricing currency) within the queried range. */
  totalRevenue: number;
  /** Average price per ton within the queried range. */
  averagePrice: number;
  /** Number of distinct buyers within the queried range. */
  uniqueBuyers: number;
  /** Percentage change in volume versus the preceding equivalent period. */
  volumeChangePercent: number;
}

/** Historical buyer trend aggregate for a region and/or project type. */
export interface HistoricalBuyerTrend {
  region: string;
  projectType: ProjectType;
  /** Number of distinct buyers in the bucket. */
  uniqueBuyers: number;
  /** Number of new buyers (first purchase) in the bucket. */
  newBuyers: number;
  /** Total volume (in tonnes) purchased in the bucket. */
  volume: number;
  /** ISO 8601 timestamp marking the start of the bucket. */
  timestamp: string;
}

/** Response payload for the historical carbon data API. */
export interface HistoricalCarbonDataResponse {
  query: HistoricalCarbonQuery;
  priceSeries: HistoricalPriceSeries;
  projectPerformance: HistoricalProjectPerformance[];
  buyerTrends: HistoricalBuyerTrend[];
  /** ISO 8601 timestamp of when the response was generated. */
  generatedAt: string;
}
