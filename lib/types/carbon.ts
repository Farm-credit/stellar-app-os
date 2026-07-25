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

export const BULK_PURCHASE_MIN_QUANTITY = 1_000;

export type MetadataStorageType = 'none' | 'on-chain' | 'ipfs';

export interface CorporateMetadata {
  companyName: string;
  initiativeDescription: string;
  initiativeUrl?: string;
  storageType: MetadataStorageType;
  storageRef?: string;
}

import type { NetworkType } from '@/lib/types/wallet';

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

export const BULK_PURCHASE_MIN_QUANTITY = 1000;

export type MetadataStorageType = 'on-chain' | 'ipfs' | 'none';

export interface CorporateMetadata {
  storageType: MetadataStorageType;
  companyName?: string;
  initiativeDescription?: string;
  initiativeUrl?: string;
  storageRef?: string;
}

export interface BulkPurchaseOrder {
  projectId: string;
  quantity: number;
  totalPrice: number;
  buyerPublicKey: string;
  network: NetworkType;
  network: 'testnet' | 'mainnet';
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
