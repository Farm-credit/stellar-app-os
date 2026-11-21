/** Supported certification registries. */
export type CertificationProvider = 'verra' | 'gold-standard';

/** Current verification state of credits against a registry. */
export type CertificationStatus = 'verified' | 'pending' | 'expired' | 'unverified';

export interface CreditHolding {
  projectId: string;
  projectName: string;
  quantity: number;
  vintage: number;
  status: 'active' | 'retired';
  pricePerTon: number;
  totalValue: number;
  assetCode: string;
  issuer: string;
  /** What the buyer paid for this holding (derived when absent). */
  purchaseCost?: number;
  /** ISO-8601 retirement date for retired credits, if known. */
  retirementDate?: string | null;
  /** Co-benefits attributed to the originating project. */
  coBenefits?: string[];
  /** Certification registry that verified the originating project. */
  certificationProvider?: CertificationProvider;
  /** Current verification state of the credits against the registry. */
  certificationStatus?: CertificationStatus;
  /** ISO-8601 timestamp of the last successful registry verification. */
  verificationCheckedAt?: string | null;
  /** ISO-8601 date when renewal documentation is due, if applicable. */
  renewalDueAt?: string | null;
}

/**
 * A normalized record pulled from a certification registry (Verra or Gold
 * Standard) for a single project. Used by the certification integration and
 * the historical API.
 */
export interface CertificationRecord {
  /** Registry that produced this record. */
  provider: CertificationProvider;
  /** Registry-native project identifier (e.g. VCS project ID). */
  registryProjectId: string;
  /** Internal project identifier this record maps to. */
  projectId: string;
  projectName: string;
  /** Registry-native identifier for the credit batch / issuance. */
  registryCreditId?: string;
  vintage: number;
  /** Verified quantity of credits, in tonnes CO2e. */
  quantity: number;
  status: CertificationStatus;
  /** ISO-8601 timestamp when the registry last confirmed the record. */
  verifiedAt: string | null;
  /** ISO-8601 date when renewal documentation is due, if applicable. */
  renewalDueAt: string | null;
  /** Co-benefits reported by the registry for the project. */
  coBenefits?: string[];
  /** Raw registry payload for auditing / debugging. */
  raw?: Record<string, unknown>;
}

/** Lifecycle state of a certification sync job. */
export type CertificationSyncJobStatus = 'queued' | 'running' | 'completed' | 'failed';

/**
 * A unit of work that pulls and reconciles certification data from a registry.
 */
export interface CertificationSyncJob {
  id: string;
  provider: CertificationProvider;
  status: CertificationSyncJobStatus;
  /** Project identifiers to sync; empty means all known projects. */
  projectIds: string[];
  /** ISO-8601 timestamp when the job was created. */
  createdAt: string;
  /** ISO-8601 timestamp when the job started running. */
  startedAt?: string | null;
  /** ISO-8601 timestamp when the job finished (successfully or not). */
  completedAt?: string | null;
  /** Number of records processed so far. */
  processed: number;
  /** Number of records that failed verification. */
  failed: number;
  /** Error message when the job failed. */
  error?: string | null;
}

/**
 * Result of verifying a single holding against its certification registry.
 */
export interface CreditVerificationResult {
  projectId: string;
  provider: CertificationProvider;
  /** Verification state derived from the registry response. */
  status: CertificationStatus;
  /** Whether the holding's data matches the registry record. */
  verified: boolean;
  /** ISO-8601 timestamp of this verification attempt. */
  checkedAt: string;
  /** ISO-8601 date when renewal documentation is due, if applicable. */
  renewalDueAt: string | null;
  /** Human-readable explanation when verification fails or is partial. */
  message?: string;
  /** The registry record used for verification, when available. */
  record?: CertificationRecord;
}

/**
 * A holding enriched for the buyer portfolio view: cost, retirement date and
 * co-benefits are always present so the UI does not need to re-derive them.
 */
export interface OwnedCredit extends CreditHolding {
  purchaseCost: number;
  retirementDate: string | null;
  coBenefits: string[];
}

export interface PortfolioStats {
  totalCredits: number;
  totalCost: number;
  totalValue: number;
  activeCredits: number;
  retiredCredits: number;
  lastUpdated: number;
}

export interface PriceCache {
  [projectId: string]: {
    price: number;
    timestamp: number;
  };
}