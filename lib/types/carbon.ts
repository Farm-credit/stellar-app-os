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

  onSelectionChange?: (newSelection: CreditSelectionState) => void;
}

/** Minimum quantity for a bulk/corporate purchase (1 000 trees = 1 000 tons CO₂) */
export const BULK_PURCHASE_MIN_QUANTITY = 1000;

/** Where the custom metadata is persisted */
export type MetadataStorageType = 'on-chain' | 'ipfs' | 'none';

/**
 * Optional branded metadata attached to a corporate bulk purchase.
 * Stored either as a Stellar transaction memo hash (on-chain) or
 * as a JSON document pinned to IPFS.
 */
export interface CorporateMetadata {
  /** Company / initiative display name */
  companyName: string;
  /** Short description of the planting initiative (max 200 chars) */
  initiativeDescription: string;
  /** Optional public URL for the initiative landing page */
  initiativeUrl?: string;
  /** Where to persist this metadata */
  storageType: MetadataStorageType;
  /** Populated after submission — IPFS CID or on-chain memo hash */
  storageRef?: string;
}

export interface BulkPurchaseOrder {
  projectId: string;
  /** Number of carbon-credit tokens (≥ BULK_PURCHASE_MIN_QUANTITY) */
  quantity: number;
  /** Total price in USDC */
  totalPrice: number;
  /** Buyer's Stellar public key */
  buyerPublicKey: string;
  network: 'testnet' | 'mainnet';
  /** Optional corporate branding metadata */
  metadata?: CorporateMetadata;
}

export interface BulkPurchaseResult {
  transactionXdr: string;
  networkPassphrase: string;
  /** IPFS CID when metadata.storageType === 'ipfs' */
  ipfsCid?: string;
  /** On-chain memo value when metadata.storageType === 'on-chain' */
  memoValue?: string;
}
