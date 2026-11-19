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
}

/* ------------------------------------------------------------------------- *
 * Charity / NGO partnership portal — Issue #1705.
 *
 * A separate onboarding flow for charities and NGOs that want to partner with
 * the platform (co-branded campaigns, charity-code fundraising pages, joint
 * impact reporting). Applications move through a fixed sequence of onboarding
 * steps; the platform admin advances them as each step is completed.
 * ------------------------------------------------------------------------- */

export const ONBOARDING_STEPS = [
  'application_submitted',
  'documents_verified',
  'agreement_signed',
  'portal_enabled',
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export type PartnerApplicationStatus = 'in_progress' | 'completed' | 'rejected';

export type PartnerOrganisationType = 'charity' | 'ngo';

export interface PartnerApplicationInput {
  organisationName: string;
  organisationType: PartnerOrganisationType;
  registrationNumber: string;
  contactName: string;
  contactEmail: string;
  websiteUrl: string;
  /** Short description of the organisation's mission. */
  mission: string;
  /** URL to the organisation's logo, used on co-branded campaign pages. */
  logoUrl: string;
  attested: boolean;
}

export interface PartnerApplication extends PartnerApplicationInput {
  id: string;
  status: PartnerApplicationStatus;
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  submittedAt: string;
  updatedAt: string;
  reviewerNote: string | null;
}

export class PartnerApplicationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'PartnerApplicationError';
    this.status = status;
  }
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//.test(value);
}

export function parsePartnerApplicationInput(
  body: Record<string, unknown>
): PartnerApplicationInput {
  const organisationType = nonEmptyString(body.organisationType, 'organisationType');
  if (organisationType !== 'charity' && organisationType !== 'ngo') {
    throw new PartnerApplicationError("organisationType must be 'charity' or 'ngo'");
  }
  const contactEmail = nonEmptyString(body.contactEmail, 'contactEmail');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    throw new PartnerApplicationError('contactEmail must be a valid email address');
  }
  const websiteUrl = nonEmptyString(body.websiteUrl, 'websiteUrl');
  if (!isHttpUrl(websiteUrl)) {
    throw new PartnerApplicationError('websiteUrl must be an http(s) URL');
  }
  const logoUrl = nonEmptyString(body.logoUrl, 'logoUrl');
  if (!isHttpUrl(logoUrl)) {
    throw new PartnerApplicationError('logoUrl must be an http(s) URL');
  }
  if (body.attested !== true) {
    throw new PartnerApplicationError('The accuracy attestation must be accepted');
  }
  return {
    organisationName: nonEmptyString(body.organisationName, 'organisationName'),
    organisationType,
    registrationNumber: nonEmptyString(body.registrationNumber, 'registrationNumber'),
    contactName: nonEmptyString(body.contactName, 'contactName'),
    contactEmail,
    websiteUrl,
    mission: nonEmptyString(body.mission, 'mission'),
    logoUrl,
    attested: true,
  };
}

const partnerApplications: PartnerApplication[] = [];
let partnerCounter = 0;

export function submitPartnerApplication(
  input: PartnerApplicationInput,
  now: Date = new Date()
): PartnerApplication {
  const open = partnerApplications.find(
    (a) =>
      a.registrationNumber === input.registrationNumber && a.status === 'in_progress'
  );
  if (open) {
    throw new PartnerApplicationError(
      'An application for this organisation is already in progress',
      409
    );
  }
  const timestamp = now.toISOString();
  const application: PartnerApplication = {
    ...input,
    id: `partner-${++partnerCounter}`,
    status: 'in_progress',
    currentStep: ONBOARDING_STEPS[0],
    completedSteps: [ONBOARDING_STEPS[0]],
    submittedAt: timestamp,
    updatedAt: timestamp,
    reviewerNote: null,
  };
  partnerApplications.push(application);
  return application;
}

export function listPartnerApplications(
  filter: { status?: PartnerApplicationStatus } = {}
): PartnerApplication[] {
  return partnerApplications.filter((a) => !filter.status || a.status === filter.status);
}

export function getPartnerApplication(id: string): PartnerApplication | undefined {
  return partnerApplications.find((a) => a.id === id);
}

/**
 * Moves an application to the next onboarding step. Advancing past the final
 * step completes onboarding and enables the partnership portal.
 */
export function advanceOnboardingStep(
  id: string,
  now: Date = new Date()
): PartnerApplication {
  const application = getPartnerApplication(id);
  if (!application) throw new PartnerApplicationError('Application not found', 404);
  if (application.status !== 'in_progress') {
    throw new PartnerApplicationError('Application is no longer in progress', 409);
  }
  const index = ONBOARDING_STEPS.indexOf(application.currentStep);
  const next = ONBOARDING_STEPS[index + 1];
  if (!next) {
    throw new PartnerApplicationError('Application has already completed onboarding', 409);
  }
  application.currentStep = next;
  if (!application.completedSteps.includes(next)) {
    application.completedSteps.push(next);
  }
  if (next === ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1]) {
    application.status = 'completed';
  }
  application.updatedAt = now.toISOString();
  return application;
}

export function rejectPartnerApplication(
  id: string,
  note: string,
  now: Date = new Date()
): PartnerApplication {
  const application = getPartnerApplication(id);
  if (!application) throw new PartnerApplicationError('Application not found', 404);
  if (application.status !== 'in_progress') {
    throw new PartnerApplicationError('Application is no longer in progress', 409);
  }
  if (!note.trim()) {
    throw new PartnerApplicationError('A note is required when rejecting an application');
  }
  application.status = 'rejected';
  application.reviewerNote = note.trim();
  application.updatedAt = now.toISOString();
  return application;
}

export function resetPartnerApplicationsForTest(): void {
  partnerApplications.length = 0;
  partnerCounter = 0;
}
