export const SUSTAINABILITY_CERTIFICATIONS = [
  'organic',
  'regenerative',
  'fair_trade',
  'b_corp',
] as const;
export type SustainabilityCertification = (typeof SUSTAINABILITY_CERTIFICATIONS)[number];
export interface FarmerCredentials {
  farmerId: string;
  farmerName: string;
  certifications: SustainabilityCertification[];
  verifiedAt: string;
  verificationSource: string;
}
export interface CertificationFilterResult {
  certification: SustainabilityCertification;
  farmerCount: number;
  listings: string[];
}
export type ForecastHorizonMonths = 3 | 6 | 9 | 12;
export interface PriceForecastRequest {
  projectId: string;
  currentPrice: number;
  horizonMonths: ForecastHorizonMonths;
  supplyGrowthPct: number;
  demandGrowthPct: number;
  policyIndex: number;
  seasonalIndex: number;
}
export interface PriceForecastPoint {
  month: string;
  predictedPrice: number;
  lowerBound: number;
  upperBound: number;
}
export interface PriceForecast extends PriceForecastRequest {
  generatedAt: string;
  modelVersion: string;
  confidence: number;
  points: PriceForecastPoint[];
}
export type OffsetPoolStatus = 'open' | 'funded' | 'purchased' | 'completed' | 'cancelled';
export interface OffsetPoolMember {
  wallet: string;
  contribution: number;
  sharePct: number;
  joinedAt: string;
}
export interface CommunityOffsetPool {
  id: string;
  name: string;
  creditListingId: string;
  targetAmount: number;
  totalContributed: number;
  creditsPurchased: number;
  status: OffsetPoolStatus;
  members: OffsetPoolMember[];
  createdAt: string;
  fundedAt?: string;
}
export interface CreateOffsetPoolInput {
  name: string;
  creditListingId: string;
  targetAmount: number;
  wallet: string;
  contribution?: number;
}
export type SettlementStatus = 'pending' | 'processing' | 'paid' | 'failed';
export interface MarketplaceSettlement {
  id: string;
  purchaseId: string;
  farmerId: string;
  buyerId: string;
  grossAmount: number;
  farmerAmount: number;
  currency: string;
  status: SettlementStatus;
  dueAt: string;
  paidAt?: string;
  failureReason?: string;
}
