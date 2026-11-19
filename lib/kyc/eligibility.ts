/*
 * Farmer certification eligibility screening.
 *
 * Pure and synchronous on purpose: given an application and a clock it returns
 * the same verdict every time. Everything that touches the network or the
 * database lives in `service.ts`, so the rules below can be exercised directly
 * in tests and re-run over historical applications when the ruleset changes.
 */

import {
  DOCUMENTARY_TENURE_TYPES,
  INFORMAL_TENURE_TYPES,
  type CertificationTier,
  type KycApplicationInput,
  type KycRequirement,
  type KycRequirementCheck,
  type KycRequirementSeverity,
  type KycScreeningResult,
} from './types';

/** Bump when the gates below change, so stored verdicts stay traceable. */
export const KYC_RULESET_VERSION = 'kyc-eligibility-v1';

export const KYC_THRESHOLDS = {
  /** Contractual minimum age for a certified farmer. */
  minimumAgeYears: 18,
  /** Below this the plot cannot support a certifiable planting commitment. */
  minimumPlotHectares: 0.1,
  /** Experience floor for any certification at all. */
  minimumExperienceYears: 1,
  /**
   * Nigeria's bounding box — the app's operating region, and the same region
   * the on-chain contract enforces via its geohash prefix check
   * (`Error::OutsideNigeriaRegion`). Deliberately generous at the edges so the
   * contract remains the tighter authority.
   */
  latitude: { min: 4.0, max: 14.0 },
  longitude: { min: 2.5, max: 14.7 },
} as const;

const BLOCKING: KycRequirementSeverity = 'blocking';
const ADVISORY: KycRequirementSeverity = 'advisory';

/** Whole years between `dateOfBirth` and `now`, floored. */
export function ageInYears(dateOfBirth: string, now: Date): number {
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) {
    return Number.NaN;
  }
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - dob.getUTCMonth();
  if (
    monthDelta < 0 ||
    (monthDelta === 0 && now.getUTCDate() < dob.getUTCDate())
  ) {
    age -= 1;
  }
  return age;
}

function isNonEmpty(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function check(
  requirement: KycRequirement,
  severity: KycRequirementSeverity,
  passed: boolean,
  detail: string
): KycRequirementCheck {
  return { requirement, severity, passed, detail };
}

/**
 * Evaluate every gate for one application.
 *
 * Order is stable (declaration order) so the persisted `checks` array diffs
 * cleanly between runs.
 */
export function screenCertificationEligibility(
  application: KycApplicationInput,
  now: Date = new Date()
): KycScreeningResult {
  const { identity, land, experience, certification } = application;
  const checks: KycRequirementCheck[] = [];

  // ── Consent ───────────────────────────────────────────────────────────────
  checks.push(
    check(
      'consent_on_record',
      BLOCKING,
      application.consentGranted === true,
      application.consentGranted
        ? 'Farmer consent is on record.'
        : 'Farmer consent has not been recorded.'
    )
  );

  // ── Identity ──────────────────────────────────────────────────────────────
  const identityMissing: string[] = [];
  if (!isNonEmpty(identity.fullName)) identityMissing.push('fullName');
  if (!isNonEmpty(identity.nationalId)) identityMissing.push('nationalId');
  if (!isNonEmpty(identity.phoneNumber)) identityMissing.push('phoneNumber');
  if (!isNonEmpty(identity.village)) identityMissing.push('village');
  if (!isNonEmpty(identity.dateOfBirth)) identityMissing.push('dateOfBirth');
  if (!isNonEmpty(identity.documentType)) identityMissing.push('documentType');

  checks.push(
    check(
      'identity_documents_complete',
      BLOCKING,
      identityMissing.length === 0,
      identityMissing.length === 0
        ? `Identity record complete (${identity.documentType}).`
        : `Missing identity fields: ${identityMissing.join(', ')}.`
    )
  );

  checks.push(
    check(
      'identity_verified',
      BLOCKING,
      isNonEmpty(identity.verifiedAt),
      isNonEmpty(identity.verifiedAt)
        ? `Identity document checked on ${identity.verifiedAt}.`
        : 'Identity document has not been checked by a verifier.'
    )
  );

  const age = ageInYears(identity.dateOfBirth, now);
  const ageOk = Number.isFinite(age) && age >= KYC_THRESHOLDS.minimumAgeYears;
  checks.push(
    check(
      'minimum_age',
      BLOCKING,
      ageOk,
      Number.isFinite(age)
        ? ageOk
          ? `Farmer is ${age} years old (minimum ${KYC_THRESHOLDS.minimumAgeYears}).`
          : `Farmer is ${age} years old; minimum is ${KYC_THRESHOLDS.minimumAgeYears}.`
        : 'Date of birth is not a parseable date.'
    )
  );

  // ── Land ownership proof ──────────────────────────────────────────────────
  const informal = INFORMAL_TENURE_TYPES.includes(land.ownershipType);
  const documentary = DOCUMENTARY_TENURE_TYPES.includes(land.ownershipType);
  const hasDocument = isNonEmpty(land.documentReference);
  const proofPresent = (documentary && hasDocument) || informal;

  checks.push(
    check(
      'land_proof_present',
      BLOCKING,
      proofPresent,
      proofPresent
        ? documentary
          ? `${land.ownershipType} tenure backed by a document reference.`
          : `${land.ownershipType} tenure recorded as an informal claim, pending verifier sign-off.`
        : `${land.ownershipType} tenure requires a document reference.`
    )
  );

  checks.push(
    check(
      'land_proof_verified',
      BLOCKING,
      isNonEmpty(land.verifiedAt),
      isNonEmpty(land.verifiedAt)
        ? `Land claim verified on ${land.verifiedAt}.`
        : 'Land ownership claim has not been verified.'
    )
  );

  const areaOk =
    Number.isFinite(land.plotSizeHectares) &&
    land.plotSizeHectares >= KYC_THRESHOLDS.minimumPlotHectares;
  checks.push(
    check(
      'land_area_minimum',
      BLOCKING,
      areaOk,
      Number.isFinite(land.plotSizeHectares)
        ? areaOk
          ? `Plot is ${land.plotSizeHectares} ha (minimum ${KYC_THRESHOLDS.minimumPlotHectares}).`
          : `Plot is ${land.plotSizeHectares} ha; minimum is ${KYC_THRESHOLDS.minimumPlotHectares}.`
        : 'Plot size is not a number.'
    )
  );

  const { latitude, longitude } = land.gpsCoordinates;
  const coordsFinite = Number.isFinite(latitude) && Number.isFinite(longitude);
  const inBounds =
    coordsFinite &&
    latitude >= KYC_THRESHOLDS.latitude.min &&
    latitude <= KYC_THRESHOLDS.latitude.max &&
    longitude >= KYC_THRESHOLDS.longitude.min &&
    longitude <= KYC_THRESHOLDS.longitude.max;

  checks.push(
    check(
      'land_location_supported',
      BLOCKING,
      inBounds,
      inBounds
        ? `Plot at ${latitude}, ${longitude} is inside the supported region.`
        : coordsFinite
          ? `Plot at ${latitude}, ${longitude} is outside the supported region.`
          : 'GPS coordinates are not numeric.'
    )
  );

  // ── Agricultural experience ───────────────────────────────────────────────
  const yearsOk =
    Number.isFinite(experience.yearsOfExperience) &&
    experience.yearsOfExperience >= KYC_THRESHOLDS.minimumExperienceYears;
  checks.push(
    check(
      'agricultural_experience_minimum',
      BLOCKING,
      yearsOk,
      Number.isFinite(experience.yearsOfExperience)
        ? yearsOk
          ? `${experience.yearsOfExperience} year(s) of experience (minimum ${KYC_THRESHOLDS.minimumExperienceYears}).`
          : `${experience.yearsOfExperience} year(s) of experience; minimum is ${KYC_THRESHOLDS.minimumExperienceYears}.`
        : 'Years of experience is not a number.'
    )
  );

  // ── Sanctions and jurisdiction ────────────────────────────────────────────
  const sanctions = certification.activeSanctions ?? [];
  checks.push(
    check(
      'no_active_sanctions',
      BLOCKING,
      sanctions.length === 0,
      sanctions.length === 0
        ? 'No active sanctions on record.'
        : `Active sanctions block certification: ${sanctions.join(', ')}.`
    )
  );

  const held = certification.jurisdictionFlags | 0;
  const required = certification.requiredJurisdictionFlags | 0;
  const jurisdictionOk = (held & required) === required;
  const missingFlags = required & ~held;
  checks.push(
    check(
      'jurisdiction_eligible',
      BLOCKING,
      jurisdictionOk,
      jurisdictionOk
        ? `Jurisdiction flags satisfy the requirement (0b${required.toString(2)}).`
        : `Missing jurisdiction flags 0b${missingFlags.toString(2)}.`
    )
  );

  // ── Advisories: confidence, not eligibility ───────────────────────────────
  const trainings = experience.trainingProgrammes ?? [];
  checks.push(
    check(
      'agricultural_training_record',
      ADVISORY,
      trainings.length > 0,
      trainings.length > 0
        ? `Training on record: ${trainings.join(', ')}.`
        : 'No agricultural training programme on record.'
    )
  );

  const secondary = experience.secondaryCrops ?? [];
  checks.push(
    check(
      'multi_crop_diversification',
      ADVISORY,
      secondary.length > 0,
      secondary.length > 0
        ? `Diversified across ${secondary.length} secondary crop(s).`
        : 'No secondary crop recorded.'
    )
  );

  const blockers = checks
    .filter((c) => c.severity === 'blocking' && !c.passed)
    .map((c) => c.requirement);
  const advisories = checks
    .filter((c) => c.severity === 'advisory' && !c.passed)
    .map((c) => c.requirement);

  const eligible = blockers.length === 0;
  const tier: CertificationTier = !eligible
    ? 'none'
    : advisories.length === 0
      ? 'full'
      : 'provisional';

  return {
    eligible,
    tier,
    checks,
    blockers,
    advisories,
    rulesetVersion: KYC_RULESET_VERSION,
    screenedAt: now.toISOString(),
  };
}
