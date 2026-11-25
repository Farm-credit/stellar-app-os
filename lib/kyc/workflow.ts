/*
 * Farmer KYC verification workflow state machine and 4-stage progress evaluator.
 *
 * Stages:
 *   1. Identity verification      (identity_documents_complete, minimum_age, identity_verified)
 *   2. Land ownership proof       (land_proof_present, land_area_minimum, land_location_supported, land_proof_verified)
 *   3. Agricultural experience    (agricultural_experience_minimum, agricultural_training_record, multi_crop_diversification)
 *   4. Certification eligibility  (consent_on_record, no_active_sanctions, jurisdiction_eligible)
 */

import {
  type KycApplicationRecord,
  type KycApplicationStatus,
  type KycRequirement,
  type KycRequirementCheck,
  type KycScreeningResult,
  type OnChainKycStatus,
  toOnChainKycStatus,
} from './types';

/**
 * Blocking requirements that cannot be satisfied at submission time because
 * they require an independent verifier to inspect identity and land evidence.
 */
export const VERIFIER_PENDING_REQUIREMENTS: readonly KycRequirement[] = [
  'identity_verified',
  'land_proof_verified',
];

/** Valid off-chain status transitions for a Farmer KYC application. */
export const ALLOWED_KYC_TRANSITIONS: Record<
  KycApplicationStatus,
  readonly KycApplicationStatus[]
> = {
  submitted: ['under_review', 'approved', 'rejected', 'expired'],
  under_review: ['approved', 'rejected', 'expired'],
  approved: ['expired'],
  rejected: [],
  expired: [],
};

export function canTransitionKycStatus(
  from: KycApplicationStatus,
  to: KycApplicationStatus
): boolean {
  return ALLOWED_KYC_TRANSITIONS[from].includes(to);
}

/**
 * Returns true when an application has either passed all gates or only awaits
 * verifier sign-off (`identity_verified` / `land_proof_verified`), meaning it
 * should enter the verifier queue (`submitted`) rather than be rejected upfront.
 */
export function hasOnlyVerifierPendingBlockers(screening: KycScreeningResult): boolean {
  if (screening.eligible) return true;
  return (
    screening.blockers.length > 0 &&
    screening.blockers.every((req) => VERIFIER_PENDING_REQUIREMENTS.includes(req))
  );
}

export type KycWorkflowStageKey =
  | 'identity_verification'
  | 'land_ownership_proof'
  | 'agricultural_experience'
  | 'certification_eligibility';

export type KycWorkflowStageStatus = 'passed' | 'pending_verification' | 'failed';

export interface KycWorkflowStage {
  key: KycWorkflowStageKey;
  label: string;
  status: KycWorkflowStageStatus;
  checks: KycRequirementCheck[];
  completedChecks: number;
  totalChecks: number;
}

export interface KycWorkflowSummary {
  applicationId: string;
  status: KycApplicationStatus;
  onChainStatus: OnChainKycStatus;
  readyForApproval: boolean;
  nextStep: string;
  stages: KycWorkflowStage[];
  completedStages: number;
  totalStages: number;
  progressPercent: number;
}

const STAGE_DEFINITIONS: ReadonlyArray<{
  key: KycWorkflowStageKey;
  label: string;
  requirements: readonly KycRequirement[];
}> = [
  {
    key: 'identity_verification',
    label: 'Identity Verification',
    requirements: ['identity_documents_complete', 'minimum_age', 'identity_verified'],
  },
  {
    key: 'land_ownership_proof',
    label: 'Land Ownership Proof',
    requirements: [
      'land_proof_present',
      'land_area_minimum',
      'land_location_supported',
      'land_proof_verified',
    ],
  },
  {
    key: 'agricultural_experience',
    label: 'Agricultural Experience',
    requirements: [
      'agricultural_experience_minimum',
      'agricultural_training_record',
      'multi_crop_diversification',
    ],
  },
  {
    key: 'certification_eligibility',
    label: 'Certification Eligibility Screening',
    requirements: ['consent_on_record', 'no_active_sanctions', 'jurisdiction_eligible'],
  },
];

function evaluateStageStatus(checks: KycRequirementCheck[]): KycWorkflowStageStatus {
  const failedBlocking = checks.filter((c) => c.severity === 'blocking' && !c.passed);
  if (failedBlocking.length === 0) {
    return 'passed';
  }
  const onlyVerifierPending = failedBlocking.every((c) =>
    VERIFIER_PENDING_REQUIREMENTS.includes(c.requirement)
  );
  return onlyVerifierPending ? 'pending_verification' : 'failed';
}

function determineNextStep(
  application: KycApplicationRecord,
  stages: KycWorkflowStage[],
  readyForApproval: boolean
): string {
  if (application.status === 'approved') {
    return 'Application approved and ready for on-chain KYC attestation.';
  }
  if (application.status === 'rejected') {
    return 'Application rejected. Review failed eligibility gates before reapplying.';
  }
  if (application.status === 'expired') {
    return 'Application expired. Farmer must submit a fresh KYC application.';
  }

  const failedStage = stages.find((s) => s.status === 'failed');
  if (failedStage) {
    return `Resolve blocking failures in ${failedStage.label}.`;
  }

  if (!application.identityVerifiedAt && !application.landVerifiedAt) {
    return 'Verifier must check identity document and confirm land ownership proof.';
  }
  if (!application.identityVerifiedAt) {
    return 'Verifier must complete identity document verification.';
  }
  if (!application.landVerifiedAt) {
    return 'Verifier must complete land ownership proof verification.';
  }
  if (readyForApproval) {
    return 'All verification gates passed. Reviewer can record final approval decision.';
  }
  return 'Application under review.';
}

/**
 * Evaluates a persisted KYC application into a structured 4-stage workflow
 * progress summary for verifiers, admins, and farmer status portals.
 */
export function evaluateKycWorkflow(application: KycApplicationRecord): KycWorkflowSummary {
  const checksByReq = new Map<KycRequirement, KycRequirementCheck>(
    application.screening.checks.map((c) => [c.requirement, c])
  );

  const stages: KycWorkflowStage[] = STAGE_DEFINITIONS.map((def) => {
    const checks = def.requirements
      .map((req) => checksByReq.get(req))
      .filter((c): c is KycRequirementCheck => Boolean(c));
    const completedChecks = checks.filter((c) => c.passed).length;

    return {
      key: def.key,
      label: def.label,
      status: evaluateStageStatus(checks),
      checks,
      completedChecks,
      totalChecks: checks.length,
    };
  });

  const completedStages = stages.filter((s) => s.status === 'passed').length;
  const totalStages = stages.length;
  const progressPercent = Math.round((completedStages / totalStages) * 100);
  const readyForApproval =
    application.screening.eligible &&
    (application.status === 'submitted' || application.status === 'under_review');

  return {
    applicationId: application.id,
    status: application.status,
    onChainStatus: toOnChainKycStatus(application.status),
    readyForApproval,
    nextStep: determineNextStep(application, stages, readyForApproval),
    stages,
    completedStages,
    totalStages,
    progressPercent,
  };
}
