/**
 * Tree planting certification for partner organisations — Issue #1691.
 *
 * A platform-administered scheme: partners apply with evidence on species
 * selection, survival monitoring and reporting; the platform admin reviews and
 * approves or rejects; approved partners (and their projects) show a badge.
 *
 * Storage is in-process; swap the array for a database without changing the
 * routes.
 */
import { MINIMUM_NATIVE_SPECIES_RATIO, calculateNativeSpeciesRatio } from '@/lib/native-species';

/** Minimum share of planted trees that must be alive at the last check. */
export const MINIMUM_SURVIVAL_RATE = 80;

/** Monitoring visits per year required to certify survival monitoring. */
export const MINIMUM_MONITORING_VISITS_PER_YEAR = 2;

/** Progress reports per year required to certify reporting. */
export const MINIMUM_REPORTS_PER_YEAR = 4;

export const CERTIFICATION_VALIDITY_YEARS = 2;

export type CertificationStatus = 'submitted' | 'approved' | 'rejected';

export type CertificationStandard = 'species_selection' | 'survival_monitoring' | 'reporting';

export interface CertificationApplicationInput {
  partnerId: string;
  organisationName: string;
  contactEmail: string;
  nativeTrees: number;
  totalTrees: number;
  monitoringVisitsPerYear: number;
  /** Percentage of planted trees found alive at the most recent check. */
  reportedSurvivalRate: number;
  reportsPerYear: number;
  evidenceUrl: string;
  attested: boolean;
}

export interface StandardCheck {
  standard: CertificationStandard;
  label: string;
  passed: boolean;
  detail: string;
}

export interface CertificationApplication extends CertificationApplicationInput {
  id: string;
  status: CertificationStatus;
  checks: StandardCheck[];
  submittedAt: string;
  reviewedAt: string | null;
  reviewerNote: string | null;
  certifiedAt: string | null;
  expiresAt: string | null;
}

export class PartnerCertificationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'PartnerCertificationError';
    this.status = status;
  }
}

/** Evaluates an application against the three certification standards. */
export function evaluateStandards(input: CertificationApplicationInput): StandardCheck[] {
  const ratio = calculateNativeSpeciesRatio(input.nativeTrees, input.totalTrees);
  return [
    {
      standard: 'species_selection',
      label: 'Species selection',
      passed: input.totalTrees > 0 && ratio.meetsPolicy,
      detail: `${ratio.nativePercentage.toFixed(0)}% native (minimum ${MINIMUM_NATIVE_SPECIES_RATIO}%)`,
    },
    {
      standard: 'survival_monitoring',
      label: 'Survival monitoring',
      passed:
        input.monitoringVisitsPerYear >= MINIMUM_MONITORING_VISITS_PER_YEAR &&
        input.reportedSurvivalRate >= MINIMUM_SURVIVAL_RATE,
      detail: `${input.monitoringVisitsPerYear} visits/year (minimum ${MINIMUM_MONITORING_VISITS_PER_YEAR}), ${input.reportedSurvivalRate}% survival (minimum ${MINIMUM_SURVIVAL_RATE}%)`,
    },
    {
      standard: 'reporting',
      label: 'Reporting',
      passed: input.reportsPerYear >= MINIMUM_REPORTS_PER_YEAR,
      detail: `${input.reportsPerYear} reports/year (minimum ${MINIMUM_REPORTS_PER_YEAR})`,
    },
  ];
}

function nonNegativeNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new PartnerCertificationError(`${field} must be a non-negative number`);
  }
  return value;
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new PartnerCertificationError(`${field} is required`);
  }
  return value.trim();
}

export function parseApplicationInput(
  body: Record<string, unknown>
): CertificationApplicationInput {
  const nativeTrees = nonNegativeNumber(body.nativeTrees, 'nativeTrees');
  const totalTrees = nonNegativeNumber(body.totalTrees, 'totalTrees');
  if (nativeTrees > totalTrees) {
    throw new PartnerCertificationError('nativeTrees cannot exceed totalTrees');
  }
  const reportedSurvivalRate = nonNegativeNumber(body.reportedSurvivalRate, 'reportedSurvivalRate');
  if (reportedSurvivalRate > 100) {
    throw new PartnerCertificationError('reportedSurvivalRate must be between 0 and 100');
  }
  const contactEmail = nonEmptyString(body.contactEmail, 'contactEmail');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    throw new PartnerCertificationError('contactEmail must be a valid email address');
  }
  const evidenceUrl = nonEmptyString(body.evidenceUrl, 'evidenceUrl');
  if (!/^https?:\/\//.test(evidenceUrl)) {
    throw new PartnerCertificationError('evidenceUrl must be an http(s) URL');
  }
  if (body.attested !== true) {
    throw new PartnerCertificationError('The accuracy attestation must be accepted');
  }
  return {
    partnerId: nonEmptyString(body.partnerId, 'partnerId'),
    organisationName: nonEmptyString(body.organisationName, 'organisationName'),
    contactEmail,
    nativeTrees,
    totalTrees,
    monitoringVisitsPerYear: nonNegativeNumber(
      body.monitoringVisitsPerYear,
      'monitoringVisitsPerYear'
    ),
    reportedSurvivalRate,
    reportsPerYear: nonNegativeNumber(body.reportsPerYear, 'reportsPerYear'),
    evidenceUrl,
    attested: true,
  };
}

const applications: CertificationApplication[] = [];
let counter = 0;

export function submitApplication(
  input: CertificationApplicationInput,
  now: Date = new Date()
): CertificationApplication {
  const open = applications.find(
    (a) => a.partnerId === input.partnerId && a.status === 'submitted'
  );
  if (open) {
    throw new PartnerCertificationError(
      'An application for this partner is already under review',
      409
    );
  }
  const application: CertificationApplication = {
    ...input,
    id: `pcert-${++counter}`,
    status: 'submitted',
    checks: evaluateStandards(input),
    submittedAt: now.toISOString(),
    reviewedAt: null,
    reviewerNote: null,
    certifiedAt: null,
    expiresAt: null,
  };
  applications.push(application);
  return application;
}

export function listApplications(
  filter: { status?: CertificationStatus; partnerId?: string } = {}
): CertificationApplication[] {
  return applications.filter(
    (a) =>
      (!filter.status || a.status === filter.status) &&
      (!filter.partnerId || a.partnerId === filter.partnerId)
  );
}

export function getApplication(id: string): CertificationApplication | undefined {
  return applications.find((a) => a.id === id);
}

/** Platform admin decision. Approval requires every standard to pass. */
export function reviewApplication(
  id: string,
  decision: 'approve' | 'reject',
  note: string | null,
  now: Date = new Date()
): CertificationApplication {
  const application = getApplication(id);
  if (!application) throw new PartnerCertificationError('Application not found', 404);
  if (application.status !== 'submitted') {
    throw new PartnerCertificationError('Application has already been reviewed', 409);
  }
  if (decision === 'reject' && !note?.trim()) {
    throw new PartnerCertificationError('A note is required when rejecting an application');
  }
  if (decision === 'approve') {
    const failed = application.checks.filter((c) => !c.passed);
    if (failed.length > 0) {
      throw new PartnerCertificationError(
        `Cannot approve: standards not met (${failed.map((c) => c.label).join(', ')})`,
        422
      );
    }
    const expires = new Date(now);
    expires.setUTCFullYear(expires.getUTCFullYear() + CERTIFICATION_VALIDITY_YEARS);
    application.status = 'approved';
    application.certifiedAt = now.toISOString();
    application.expiresAt = expires.toISOString();
  } else {
    application.status = 'rejected';
  }
  application.reviewedAt = now.toISOString();
  application.reviewerNote = note?.trim() || null;
  return application;
}

/** The partner's current, unexpired certification, if any. */
export function getActiveCertification(
  partnerId: string,
  now: Date = new Date()
): CertificationApplication | undefined {
  return applications.find(
    (a) =>
      a.partnerId === partnerId &&
      a.status === 'approved' &&
      a.expiresAt !== null &&
      Date.parse(a.expiresAt) > now.getTime()
  );
}

export function isPartnerCertified(partnerId: string, now: Date = new Date()): boolean {
  return getActiveCertification(partnerId, now) !== undefined;
}

export function resetPartnerCertificationsForTest(): void {
  applications.length = 0;
  counter = 0;
  certificationRecords.length = 0;
  certificationSyncJobs.length = 0;
  renewalDocuments.length = 0;
  syncCounter = 0;
  recordCounter = 0;
  documentCounter = 0;
}

// ---------------------------------------------------------------------------
// Certification integration — Verra / Gold Standard (Issue #1286)
// ---------------------------------------------------------------------------

export type CertificationProvider = 'verra' | 'gold_standard';

export type CertificationSyncJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export type CertificationRecordStatus = 'active' | 'expired' | 'revoked' | 'pending';

export interface CertificationProviderProject {
  providerProjectId: string;
  name: string;
  country: string;
  standard: CertificationProvider;
  registryUrl: string;
  creditsIssued: number;
  creditsRetired: number;
  vintage: string;
  status: CertificationRecordStatus;
  validFrom: string;
  validUntil: string;
}

export interface CertificationProviderAdapter {
  provider: CertificationProvider;
  /** Pulls the current project record from the registry. */
  fetchProject(providerProjectId: string): Promise<CertificationProviderProject>;
  /** Verifies that a serial number corresponds to a real, unretired credit. */
  verifyCredit(
    providerProjectId: string,
    serialNumber: string
  ): Promise<{ valid: boolean; reason: string | null }>;
}

export interface CertificationRecord {
  id: string;
  partnerId: string;
  provider: CertificationProvider;
  providerProjectId: string;
  projectName: string;
  status: CertificationRecordStatus;
  creditsIssued: number;
  creditsRetired: number;
  validFrom: string;
  validUntil: string;
  registryUrl: string;
  lastSyncedAt: string;
}

export interface CertificationSyncJob {
  id: string;
  recordId: string;
  provider: CertificationProvider;
  providerProjectId: string;
  status: CertificationSyncJobStatus;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
}

export interface RenewalDocument {
  id: string;
  recordId: string;
  name: string;
  url: string;
  uploadedAt: string;
}

export interface RenewalReminder {
  recordId: string;
  partnerId: string;
  provider: CertificationProvider;
  dueAt: string;
  daysUntilDue: number;
  overdue: boolean;
}

/** Days before expiry at which a renewal reminder is raised. */
export const RENEWAL_REMINDER_DAYS = 60;

const certificationRecords: CertificationRecord[] = [];
const certificationSyncJobs: CertificationSyncJob[] = [];
const renewalDocuments: RenewalDocument[] = [];
let syncCounter = 0;
let recordCounter = 0;
let documentCounter = 0;

/** In-memory registry adapters; swap for real API clients in production. */
const providerAdapters: Record<CertificationProvider, CertificationProviderAdapter> = {
  verra: {
    provider: 'verra',
    async fetchProject(providerProjectId) {
      return {
        providerProjectId,
        name: `Verra project ${providerProjectId}`,
        country: 'BR',
        standard: 'verra',
        registryUrl: `https://registry.verra.org/app/projectDetail/VCS/${providerProjectId}`,
        creditsIssued: 0,
        creditsRetired: 0,
        vintage: String(new Date().getUTCFullYear()),
        status: 'active',
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      };
    },
    async verifyCredit(_providerProjectId, serialNumber) {
      if (!serialNumber.trim()) {
        return { valid: false, reason: 'Serial number is required' };
      }
      return { valid: true, reason: null };
    },
  },
  gold_standard: {
    provider: 'gold_standard',
    async fetchProject(providerProjectId) {
      return {
        providerProjectId,
        name: `Gold Standard project ${providerProjectId}`,
        country: 'KE',
        standard: 'gold_standard',
        registryUrl: `https://registry.goldstandard.org/projects/${providerProjectId}`,
        creditsIssued: 0,
        creditsRetired: 0,
        vintage: String(new Date().getUTCFullYear()),
        status: 'active',
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      };
    },
    async verifyCredit(_providerProjectId, serialNumber) {
      if (!serialNumber.trim()) {
        return { valid: false, reason: 'Serial number is required' };
      }
      return { valid: true, reason: null };
    },
  },
};

export function getProviderAdapter(provider: CertificationProvider): CertificationProviderAdapter {
  const adapter = providerAdapters[provider];
  if (!adapter) {
    throw new PartnerCertificationError(`Unsupported certification provider: ${provider}`, 400);
  }
  return adapter;
}

function findRecord(recordId: string): CertificationRecord {
  const record = certificationRecords.find((r) => r.id === recordId);
  if (!record) throw new PartnerCertificationError('Certification record not found', 404);
  return record;
}

/**
 * Pulls project data from the provider registry, upserts the local
 * CertificationRecord and records a CertificationSyncJob.
 */
export async function syncCertificationProject(
  partnerId: string,
  provider: CertificationProvider,
  providerProjectId: string,
  now: Date = new Date()
): Promise<{ record: CertificationRecord; job: CertificationSyncJob }> {
  const adapter = getProviderAdapter(provider);
  const job: CertificationSyncJob = {
    id: `csync-${++syncCounter}`,
    recordId: '',
    provider,
    providerProjectId,
    status: 'running',
    startedAt: now.toISOString(),
    finishedAt: null,
    error: null,
  };
  certificationSyncJobs.push(job);

  try {
    const project = await adapter.fetchProject(providerProjectId);
    let record = certificationRecords.find(
      (r) => r.provider === provider && r.providerProjectId === providerProjectId
    );
    if (!record) {
      record = {
        id: `crec-${++recordCounter}`,
        partnerId,
        provider,
        providerProjectId,
        projectName: project.name,
        status: project.status,
        creditsIssued: project.creditsIssued,
        creditsRetired: project.creditsRetired,
        validFrom: project.validFrom,
        validUntil: project.validUntil,
        registryUrl: project.registryUrl,
        lastSyncedAt: now.toISOString(),
      };
      certificationRecords.push(record);
    } else {
      record.partnerId = partnerId;
      record.projectName = project.name;
      record.status = project.status;
      record.creditsIssued = project.creditsIssued;
      record.creditsRetired = project.creditsRetired;
      record.validFrom = project.validFrom;
      record.validUntil = project.validUntil;
      record.registryUrl = project.registryUrl;
      record.lastSyncedAt = now.toISOString();
    }
    job.recordId = record.id;
    job.status = 'completed';
    job.finishedAt = now.toISOString();
    return { record, job };
  } catch (error) {
    job.status = 'failed';
    job.finishedAt = now.toISOString();
    job.error = error instanceof Error ? error.message : 'Unknown sync error';
    throw error;
  }
}

/** Verifies a credit serial number against the provider registry. */
export async function verifyCredit(
  provider: CertificationProvider,
  providerProjectId: string,
  serialNumber: string
): Promise<{ valid: boolean; reason: string | null }> {
  const adapter = getProviderAdapter(provider);
  return adapter.verifyCredit(providerProjectId, serialNumber);
}

/** Stores a renewal document against a certification record. */
export function addRenewalDocument(
  recordId: string,
  name: string,
  url: string,
  now: Date = new Date()
): RenewalDocument {
  findRecord(recordId);
  const document: RenewalDocument = {
    id: `cdoc-${++documentCounter}`,
    recordId,
    name: nonEmptyString(name, 'name'),
    url: nonEmptyString(url, 'url'),
    uploadedAt: now.toISOString(),
  };
  renewalDocuments.push(document);
  return document;
}

export function getRenewalDocuments(recordId: string): RenewalDocument[] {
  return renewalDocuments.filter((d) => d.recordId === recordId);
}

/** Renewal reminders for records approaching or past their expiry. */
export function getRenewalReminders(now: Date = new Date()): RenewalReminder[] {
  const reminders: RenewalReminder[] = [];
  for (const record of certificationRecords) {
    const dueMs = Date.parse(record.validUntil);
    if (!Number.isFinite(dueMs)) continue;
    const daysUntilDue = Math.ceil((dueMs - now.getTime()) / (24 * 60 * 60 * 1000));
    if (daysUntilDue > RENEWAL_REMINDER_DAYS) continue;
    reminders.push({
      recordId: record.id,
      partnerId: record.partnerId,
      provider: record.provider,
      dueAt: record.validUntil,
      daysUntilDue,
      overdue: daysUntilDue < 0,
    });
  }
  return reminders;
}

export interface CertificationStatusSummary {
  partnerId: string;
  certified: boolean;
  records: CertificationRecord[];
  reminders: RenewalReminder[];
}

/** Aggregated certification status for a partner across all providers. */
export function getCertificationStatus(
  partnerId: string,
  now: Date = new Date()
): CertificationStatusSummary {
  const records = certificationRecords.filter((r) => r.partnerId === partnerId);
  const reminders = getRenewalReminders(now).filter((r) => r.partnerId === partnerId);
  const certified =
    isPartnerCertified(partnerId, now) ||
    records.some(
      (r) => r.status === 'active' && Date.parse(r.validUntil) > now.getTime()
    );
  return { partnerId, certified, records, reminders };
}
