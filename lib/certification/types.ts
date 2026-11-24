export const CERTIFICATION_PROVIDERS = ['verra', 'gold-standard'] as const;

export type CertificationProvider = (typeof CERTIFICATION_PROVIDERS)[number];

export type RegistryProtocol = CertificationProvider;

export type CertificationProjectStatus =
  'validation' | 'registered' | 'active' | 'suspended' | 'completed' | 'cancelled' | 'unknown';

export interface CertificationDocument {
  externalId: string;
  type: string;
  name: string;
  status: 'required' | 'submitted' | 'accepted' | 'rejected' | 'unknown';
  issuedAt: string | null;
  expiresAt: string | null;
  sourceUrl: string | null;
}

export interface CertificationProject {
  provider: CertificationProvider;
  projectId: string;
  name: string;
  status: CertificationProjectStatus;
  countryCode: string | null;
  methodologyId: string | null;
  methodologyName: string | null;
  proponent: string | null;
  creditingPeriodStart: string | null;
  creditingPeriodEnd: string | null;
  issuedCredits: number;
  availableCredits: number;
  retiredCredits: number;
  documents: CertificationDocument[];
  providerUpdatedAt: string | null;
  syncedAt: string;
}

export type ProviderCreditStatus = 'active' | 'retired' | 'cancelled' | 'pending' | 'unknown';

export interface ProviderCredit {
  provider: CertificationProvider;
  projectId: string;
  serialNumber: string;
  status: ProviderCreditStatus;
  vintage: number | null;
  quantity: number;
  unit: string;
  issuedAt: string | null;
  retiredAt: string | null;
}

export interface CreditVerificationRequest {
  provider: CertificationProvider;
  projectId: string;
  serialNumber: string;
  vintage?: number;
  quantity?: number;
}

export interface CreditVerificationMismatch {
  field: 'projectId' | 'vintage' | 'quantity';
  expected: string | number;
  actual: string | number | null;
}

export interface CreditVerification {
  id: string;
  provider: CertificationProvider;
  projectId: string;
  serialNumber: string;
  outcome: 'verified' | 'mismatch' | 'not_verifiable';
  providerStatus: ProviderCreditStatus;
  mismatches: CreditVerificationMismatch[];
  checkedAt: string;
  credit: ProviderCredit;
}

export type RenewalStatus =
  'not_due' | 'due' | 'overdue' | 'submitted' | 'accepted' | 'rejected' | 'unknown';

export interface RenewalDocument extends CertificationDocument {
  generated: boolean;
  metadata: Record<string, string>;
}

export interface ProviderRenewal {
  provider: CertificationProvider;
  projectId: string;
  status: RenewalStatus;
  dueAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  documents: CertificationDocument[];
}

export interface CertificationRenewal {
  provider: CertificationProvider;
  projectId: string;
  status: RenewalStatus;
  dueAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  documents: RenewalDocument[];
  syncedAt: string;
}

export interface CertificationProviderAdapter {
  readonly provider: CertificationProvider;
  getProject(projectId: string): Promise<CertificationProject>;
  getCredit(serialNumber: string): Promise<ProviderCredit>;
  getRenewal(projectId: string): Promise<ProviderRenewal>;
}

export interface RegistryProjectData {
  projectId: string;
  projectName: string;
  projectStatus: CertificationProjectStatus;
  vintage: number | null;
  totalTonnage: number;
  protocol: RegistryProtocol;
  countryCode: string | null;
  methodologyId: string | null;
  proponent: string | null;
  creditingPeriodStart: string | null;
  creditingPeriodEnd: string | null;
  providerUpdatedAt: string | null;
}

export interface RegistryRetirementData {
  serialNumber: string;
  projectId: string;
  vintage: number | null;
  tonnage: number;
  retiredAt: string | null;
  retirementStatus: ProviderCreditStatus;
  protocol: RegistryProtocol;
  retirementNote: string | null;
  beneficiary: string | null;
}

export interface RegistryClient {
  readonly protocol: RegistryProtocol;
  fetchProject(projectId: string): Promise<RegistryProjectData>;
  fetchRetirement(serialNumber: string): Promise<RegistryRetirementData>;
  listProjectRetirements(projectId: string): Promise<RegistryRetirementData[]>;
}

export type RegistryClientFactory = (protocol: RegistryProtocol) => RegistryClient | null;

export interface TokenizationRequest {
  protocol: RegistryProtocol;
  projectId: string;
  serialNumber: string;
  recipientWallet: string;
  vintage?: number;
  expectedTonnage?: number;
  network?: 'testnet' | 'mainnet';
}

export interface TokenizationValidationResult {
  valid: boolean;
  project: RegistryProjectData | null;
  retirement: RegistryRetirementData | null;
  errors: CreditValidationError[];
  validationId: string;
  validatedAt: string;
}

export type CreditValidationErrorCode =
  | 'PROJECT_NOT_FOUND'
  | 'PROJECT_NOT_ACTIVE'
  | 'PROJECT_STATUS_UNKNOWN'
  | 'RETIREMENT_NOT_FOUND'
  | 'RETIREMENT_SERIAL_INVALID'
  | 'RETIREMENT_NOT_RETIRED'
  | 'RETIREMENT_STATUS_INVALID'
  | 'VINTAGE_MISMATCH'
  | 'TONNAGE_MISMATCH'
  | 'PROJECT_ID_MISMATCH'
  | 'ALREADY_MINTED'
  | 'PROTOCOL_NOT_SUPPORTED'
  | 'REGISTRY_API_ERROR'
  | 'REGISTRY_RATE_LIMITED'
  | 'REGISTRY_TIMEOUT'
  | 'VALIDATION_INTERNAL_ERROR';

export interface CreditValidationError {
  code: CreditValidationErrorCode;
  message: string;
  field?: string;
  expected?: string | number | null;
  actual?: string | number | null;
  retryable?: boolean;
}

export interface MintedCreditRecord {
  id: string;
  tokenId: string;
  protocol: RegistryProtocol;
  projectId: string;
  serialNumber: string;
  vintage: number | null;
  tonnage: number;
  recipientWallet: string;
  mintedAt: string;
  txHash: string;
  contractAddress: string;
  network: 'testnet' | 'mainnet';
  metadataUri: string;
  validationId: string;
}
