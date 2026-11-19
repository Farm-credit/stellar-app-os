/*
 * Farmer KYC domain types.
 *
 * Scope: the *off-chain* process that produces the evidence a verifier signs
 * off on. The on-chain `kyc-attestation` contract
 * (`contracts/kyc-attestation/src/lib.rs`) remains the authority for a farmer's
 * attested KYC status — this module decides what is worth attesting to, and
 * `toOnChainKycStatus` is the single place where the two vocabularies meet.
 *
 * The contract deliberately stores no PII (see `ZkProofInput`'s doc comment:
 * "no PII ever appears in the transaction or ledger state"). This module holds
 * the same line: national ids and land document references are persisted as
 * salted SHA-256 digests, never in the clear.
 */

/** Mirrors `KycStatus` in `contracts/kyc-attestation/src/lib.rs`. */
export type OnChainKycStatus = 'pending' | 'verified' | 'rejected' | 'expired';

/** Where an application sits in the off-chain review pipeline. */
export type KycApplicationStatus =
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'expired';

/**
 * Map an off-chain application state onto the on-chain status vocabulary.
 *
 * `under_review` maps to `pending` rather than `rejected`: a reviewer is still
 * working the case and the farmer must not read as rejected on-chain while it
 * is open.
 */
export function toOnChainKycStatus(
  status: KycApplicationStatus
): OnChainKycStatus {
  switch (status) {
    case 'approved':
      return 'verified';
    case 'rejected':
      return 'rejected';
    case 'expired':
      return 'expired';
    case 'submitted':
    case 'under_review':
      return 'pending';
  }
}

/** Identity document kinds accepted for farmer KYC. */
export type IdentityDocumentType =
  | 'nin'
  | 'voter_card'
  | 'passport'
  | 'drivers_licence';

/**
 * Land tenure as the farmer declares it.
 *
 * `title_deed` and `lease` are documentary tenures and must carry a document
 * reference. `customary`, `communal` and `family_inheritance` are recognised
 * informal tenures that are legitimate in the operating regions but still
 * require verifier sign-off before they count as proved.
 */
export type LandOwnershipType =
  | 'title_deed'
  | 'lease'
  | 'customary'
  | 'communal'
  | 'family_inheritance';

/** Tenures that cannot be expected to produce a formal document. */
export const INFORMAL_TENURE_TYPES: readonly LandOwnershipType[] = [
  'customary',
  'communal',
  'family_inheritance',
];

/** Tenures that must produce a document reference to be considered present. */
export const DOCUMENTARY_TENURE_TYPES: readonly LandOwnershipType[] = [
  'title_deed',
  'lease',
];

export interface GpsCoordinates {
  latitude: number;
  longitude: number;
}

export interface IdentityEvidence {
  fullName: string;
  /** Raw national id — hashed on the way to storage, never persisted as-is. */
  nationalId: string;
  phoneNumber: string;
  village: string;
  /** ISO-8601 calendar date (`YYYY-MM-DD`). */
  dateOfBirth: string;
  documentType: IdentityDocumentType;
  /** Raw document reference — hashed on the way to storage. */
  documentReference?: string;
  /** Set once a verifier has checked the document against the person. */
  verifiedAt?: string;
}

export interface LandOwnershipEvidence {
  ownershipType: LandOwnershipType;
  /** Raw document reference — hashed on the way to storage. */
  documentReference?: string;
  plotSizeHectares: number;
  gpsCoordinates: GpsCoordinates;
  region: string;
  /** Set once a verifier has walked or otherwise confirmed the plot. */
  verifiedAt?: string;
}

export interface AgriculturalExperienceEvidence {
  yearsOfExperience: number;
  primaryCrop: string;
  secondaryCrops?: string[];
  soilType: string;
  trainingProgrammes?: string[];
}

/**
 * Inputs the jurisdiction gate needs, mirroring the contract's
 * `get_jurisdiction_flags` / `has_jurisdiction_compliance` bitmask API.
 */
export interface CertificationContext {
  /** Bitmask of flags the farmer currently holds. */
  jurisdictionFlags: number;
  /** Bitmask the target certification demands. */
  requiredJurisdictionFlags: number;
  /** Active sanctions; any entry blocks certification outright. */
  activeSanctions?: string[];
}

/** A submitted KYC application, after normalisation. */
export interface KycApplicationInput {
  farmerAddress: string;
  identity: IdentityEvidence;
  land: LandOwnershipEvidence;
  experience: AgriculturalExperienceEvidence;
  certification: CertificationContext;
  /** The onboarding wizard's consent gate, carried through as evidence. */
  consentGranted: boolean;
}

export interface KycDecision {
  decision: 'approve' | 'reject';
  reviewer: string;
  reason?: string;
  decidedAt: string;
}

/** A persisted application, with its screening result. */
export interface KycApplication extends KycApplicationInput {
  id: string;
  status: KycApplicationStatus;
  screening: KycScreeningResult;
  decision?: KycDecision;
  submittedAt: string;
  updatedAt: string;
}

/**
 * The persisted read model, as returned by `KycService` read methods.
 *
 * Differs from `KycApplication` in one deliberate way: the national id and land
 * document reference come back as their stored salted digests
 * (`nationalIdHash`, `documentReferenceHash`) rather than in the clear. Raw
 * identifiers are write-only — they are hashed on submission and no read path
 * can reconstruct them, matching the on-chain contract's no-PII stance.
 */
export interface KycApplicationRecord {
  id: string;
  farmerAddress: string;
  fullName: string;
  nationalIdHash: string;
  phoneNumber: string;
  village: string;
  dateOfBirth: string;
  documentType: IdentityDocumentType;
  documentReferenceHash: string | null;
  /** Stamped by the verifier path; `null` until checked. */
  identityVerifiedAt: string | null;
  ownershipType: LandOwnershipType;
  plotSizeHectares: number;
  gpsCoordinates: GpsCoordinates;
  region: string;
  /** Stamped by the verifier path; `null` until checked. */
  landVerifiedAt: string | null;
  yearsOfExperience: number;
  primaryCrop: string;
  secondaryCrops: string[];
  soilType: string;
  trainingProgrammes: string[];
  jurisdictionFlags: number;
  requiredJurisdictionFlags: number;
  activeSanctions: string[];
  consentGranted: boolean;
  status: KycApplicationStatus;
  screening: KycScreeningResult;
  decision: KycDecision | null;
  submittedAt: string;
  updatedAt: string;
}

// ── Screening ───────────────────────────────────────────────────────────────

/**
 * Every gate the certification screen evaluates.
 *
 * Blocking requirements decide eligibility; advisory ones only decide how
 * confident the resulting certification is (see `CertificationTier`).
 */
export type KycRequirement =
  | 'consent_on_record'
  | 'identity_documents_complete'
  | 'identity_verified'
  | 'minimum_age'
  | 'land_proof_present'
  | 'land_proof_verified'
  | 'land_area_minimum'
  | 'land_location_supported'
  | 'agricultural_experience_minimum'
  | 'no_active_sanctions'
  | 'jurisdiction_eligible'
  | 'agricultural_training_record'
  | 'multi_crop_diversification';

export type KycRequirementSeverity = 'blocking' | 'advisory';

export interface KycRequirementCheck {
  requirement: KycRequirement;
  severity: KycRequirementSeverity;
  passed: boolean;
  /** Why the check landed where it did — surfaced to reviewers verbatim. */
  detail: string;
}

/**
 * `full`      — every gate passed.
 * `provisional` — eligible, but one or more advisory gates failed, so the
 *                 certification is granted with reduced confidence.
 * `none`      — a blocking gate failed; not eligible.
 */
export type CertificationTier = 'none' | 'provisional' | 'full';

export interface KycScreeningResult {
  eligible: boolean;
  tier: CertificationTier;
  checks: KycRequirementCheck[];
  /** Failed blocking requirements. */
  blockers: KycRequirement[];
  /** Failed advisory requirements. */
  advisories: KycRequirement[];
  rulesetVersion: string;
  screenedAt: string;
}

/** Field-level validation failure for a submission. */
export interface KycValidationError {
  field: string;
  message: string;
}

export interface KycValidationResult {
  valid: boolean;
  errors: KycValidationError[];
}
