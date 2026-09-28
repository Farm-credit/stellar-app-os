export const CERTIFICATION_PROVIDERS = ['verra', 'gold-standard'] as const;

export type CertificationProvider = (typeof CERTIFICATION_PROVIDERS)[number];

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
