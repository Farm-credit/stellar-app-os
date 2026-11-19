/*
 * Submission validation and PII hashing for farmer KYC.
 *
 * Two responsibilities, both deliberately kept out of the screening engine:
 *
 *  1. `validateKycSubmission` turns an untrusted request body into either a
 *     normalised `KycApplicationInput` or a list of field-level errors. It does
 *     not judge *eligibility* — only whether the payload is well-formed enough
 *     to screen.
 *  2. `hashIdentifier` produces the salted digests that go to the database, so
 *     raw national ids and land document references never reach storage. The
 *     on-chain contract applies the same principle to proofs; this is the
 *     off-chain counterpart.
 */

import { createHash } from 'node:crypto';
import {
  DOCUMENTARY_TENURE_TYPES,
  INFORMAL_TENURE_TYPES,
  type GpsCoordinates,
  type IdentityDocumentType,
  type KycApplicationInput,
  type KycValidationError,
  type KycValidationResult,
  type LandOwnershipType,
} from './types';

const IDENTITY_DOCUMENT_TYPES: readonly IdentityDocumentType[] = [
  'nin',
  'voter_card',
  'passport',
  'drivers_licence',
];

const LAND_OWNERSHIP_TYPES: readonly LandOwnershipType[] = [
  ...DOCUMENTARY_TENURE_TYPES,
  ...INFORMAL_TENURE_TYPES,
];

/**
 * Stellar public keys are 56-char base32 starting with `G`. Validated in the
 * same spirit as `app/api/auth/nonce/route.ts`, which applies the identical
 * shape check before issuing a wallet nonce.
 */
const STELLAR_ADDRESS = /^G[A-Z2-7]{55}$/;

/** ISO-8601 calendar date, no time component. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isNonEmptyString).map((v) => v.trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validate and normalise a raw submission body.
 *
 * On success the returned `input` is safe to hand to
 * `screenCertificationEligibility`; verification timestamps are intentionally
 * *not* settable here — they are stamped by the verifier path, so a farmer
 * cannot self-certify by posting `verifiedAt`.
 */
export function validateKycSubmission(
  body: unknown
): KycValidationResult & { input?: KycApplicationInput } {
  const errors: KycValidationError[] = [];

  if (!isRecord(body)) {
    return {
      valid: false,
      errors: [{ field: '', message: 'Request body must be a JSON object.' }],
    };
  }

  // ── Farmer address ────────────────────────────────────────────────────────
  const farmerAddress = body.farmerAddress;
  if (!isNonEmptyString(farmerAddress)) {
    errors.push({ field: 'farmerAddress', message: 'A Stellar address is required.' });
  } else if (!STELLAR_ADDRESS.test(farmerAddress.trim())) {
    errors.push({
      field: 'farmerAddress',
      message: 'Must be a 56-character Stellar public key starting with G.',
    });
  }

  // ── Identity ──────────────────────────────────────────────────────────────
  const identityRaw = isRecord(body.identity) ? body.identity : {};
  const fullName = identityRaw.fullName;
  if (!isNonEmptyString(fullName)) {
    errors.push({ field: 'identity.fullName', message: 'Full name is required.' });
  }

  const nationalId = identityRaw.nationalId;
  if (!isNonEmptyString(nationalId)) {
    errors.push({ field: 'identity.nationalId', message: 'National ID is required.' });
  }

  const phoneNumber = identityRaw.phoneNumber;
  if (!isNonEmptyString(phoneNumber)) {
    errors.push({ field: 'identity.phoneNumber', message: 'Phone number is required.' });
  }

  const village = identityRaw.village;
  if (!isNonEmptyString(village)) {
    errors.push({ field: 'identity.village', message: 'Village or ward is required.' });
  }

  const dateOfBirth = identityRaw.dateOfBirth;
  if (!isNonEmptyString(dateOfBirth)) {
    errors.push({ field: 'identity.dateOfBirth', message: 'Date of birth is required.' });
  } else if (!ISO_DATE.test(dateOfBirth.trim()) || Number.isNaN(new Date(dateOfBirth).getTime())) {
    errors.push({
      field: 'identity.dateOfBirth',
      message: 'Must be an ISO-8601 date (YYYY-MM-DD).',
    });
  } else if (new Date(dateOfBirth).getTime() > Date.now()) {
    errors.push({
      field: 'identity.dateOfBirth',
      message: 'Date of birth cannot be in the future.',
    });
  }

  const documentType = identityRaw.documentType;
  if (!isNonEmptyString(documentType)) {
    errors.push({ field: 'identity.documentType', message: 'Document type is required.' });
  } else if (!IDENTITY_DOCUMENT_TYPES.includes(documentType as IdentityDocumentType)) {
    errors.push({
      field: 'identity.documentType',
      message: `Must be one of: ${IDENTITY_DOCUMENT_TYPES.join(', ')}.`,
    });
  }

  // ── Land ──────────────────────────────────────────────────────────────────
  const landRaw = isRecord(body.land) ? body.land : {};
  const ownershipType = landRaw.ownershipType;
  if (!isNonEmptyString(ownershipType)) {
    errors.push({ field: 'land.ownershipType', message: 'Ownership type is required.' });
  } else if (!LAND_OWNERSHIP_TYPES.includes(ownershipType as LandOwnershipType)) {
    errors.push({
      field: 'land.ownershipType',
      message: `Must be one of: ${LAND_OWNERSHIP_TYPES.join(', ')}.`,
    });
  }

  const documentReference = landRaw.documentReference;
  if (
    isNonEmptyString(ownershipType) &&
    DOCUMENTARY_TENURE_TYPES.includes(ownershipType as LandOwnershipType) &&
    !isNonEmptyString(documentReference)
  ) {
    // Caught here as well as in screening so the farmer gets a field-level
    // error instead of a bare "not eligible".
    errors.push({
      field: 'land.documentReference',
      message: `A document reference is required for ${ownershipType} tenure.`,
    });
  }

  const plotSizeHectares = landRaw.plotSizeHectares;
  if (!isFiniteNumber(plotSizeHectares)) {
    errors.push({
      field: 'land.plotSizeHectares',
      message: 'Plot size in hectares is required and must be a number.',
    });
  } else if (plotSizeHectares <= 0) {
    errors.push({
      field: 'land.plotSizeHectares',
      message: 'Plot size must be greater than zero.',
    });
  }

  const coordsRaw = isRecord(landRaw.gpsCoordinates) ? landRaw.gpsCoordinates : {};
  const latitude = coordsRaw.latitude;
  const longitude = coordsRaw.longitude;
  if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) {
    errors.push({
      field: 'land.gpsCoordinates',
      message: 'GPS latitude and longitude are required and must be numbers.',
    });
  } else {
    if (latitude < -90 || latitude > 90) {
      errors.push({ field: 'land.gpsCoordinates.latitude', message: 'Latitude must be between -90 and 90.' });
    }
    if (longitude < -180 || longitude > 180) {
      errors.push({ field: 'land.gpsCoordinates.longitude', message: 'Longitude must be between -180 and 180.' });
    }
  }

  const region = landRaw.region;
  if (!isNonEmptyString(region)) {
    errors.push({ field: 'land.region', message: 'Region is required.' });
  }

  // ── Experience ────────────────────────────────────────────────────────────
  const experienceRaw = isRecord(body.experience) ? body.experience : {};
  const yearsOfExperience = experienceRaw.yearsOfExperience;
  if (!isFiniteNumber(yearsOfExperience)) {
    errors.push({
      field: 'experience.yearsOfExperience',
      message: 'Years of experience is required and must be a number.',
    });
  } else if (yearsOfExperience < 0) {
    errors.push({
      field: 'experience.yearsOfExperience',
      message: 'Years of experience cannot be negative.',
    });
  }

  const primaryCrop = experienceRaw.primaryCrop;
  if (!isNonEmptyString(primaryCrop)) {
    errors.push({ field: 'experience.primaryCrop', message: 'Primary crop is required.' });
  }

  const soilType = experienceRaw.soilType;
  if (!isNonEmptyString(soilType)) {
    errors.push({ field: 'experience.soilType', message: 'Soil type is required.' });
  }

  // ── Certification context ─────────────────────────────────────────────────
  const certificationRaw = isRecord(body.certification) ? body.certification : {};
  const jurisdictionFlags = certificationRaw.jurisdictionFlags;
  const requiredJurisdictionFlags = certificationRaw.requiredJurisdictionFlags;
  if (jurisdictionFlags !== undefined && !isFiniteNumber(jurisdictionFlags)) {
    errors.push({ field: 'certification.jurisdictionFlags', message: 'Must be a number.' });
  }
  if (requiredJurisdictionFlags !== undefined && !isFiniteNumber(requiredJurisdictionFlags)) {
    errors.push({ field: 'certification.requiredJurisdictionFlags', message: 'Must be a number.' });
  }

  const consentGranted = body.consentGranted;
  if (typeof consentGranted !== 'boolean') {
    errors.push({ field: 'consentGranted', message: 'Consent must be explicitly granted or withheld.' });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const gpsCoordinates: GpsCoordinates = {
    latitude: latitude as number,
    longitude: longitude as number,
  };

  const input: KycApplicationInput = {
    farmerAddress: (farmerAddress as string).trim(),
    identity: {
      fullName: (fullName as string).trim(),
      nationalId: (nationalId as string).trim(),
      phoneNumber: (phoneNumber as string).trim(),
      village: (village as string).trim(),
      dateOfBirth: (dateOfBirth as string).trim(),
      documentType: documentType as IdentityDocumentType,
      documentReference: isNonEmptyString(identityRaw.documentReference)
        ? identityRaw.documentReference.trim()
        : undefined,
    },
    land: {
      ownershipType: ownershipType as LandOwnershipType,
      documentReference: isNonEmptyString(documentReference)
        ? documentReference.trim()
        : undefined,
      plotSizeHectares: plotSizeHectares as number,
      gpsCoordinates,
      region: (region as string).trim(),
    },
    experience: {
      yearsOfExperience: yearsOfExperience as number,
      primaryCrop: (primaryCrop as string).trim(),
      secondaryCrops: asStringArray(experienceRaw.secondaryCrops),
      soilType: (soilType as string).trim(),
      trainingProgrammes: asStringArray(experienceRaw.trainingProgrammes),
    },
    certification: {
      jurisdictionFlags: isFiniteNumber(jurisdictionFlags) ? jurisdictionFlags : 0,
      requiredJurisdictionFlags: isFiniteNumber(requiredJurisdictionFlags)
        ? requiredJurisdictionFlags
        : 0,
      activeSanctions: asStringArray(certificationRaw.activeSanctions),
    },
    consentGranted: consentGranted as boolean,
  };

  return { valid: true, errors: [], input };
}

/**
 * Read the hashing salt.
 *
 * Throws rather than falling back to a default: a silent constant salt would
 * make stored digests trivially reversible across every deployment, which
 * defeats the point of hashing the identifiers at all.
 */
function identifierSalt(): string {
  const salt = process.env.KYC_IDENTITY_SALT;
  if (!salt) {
    throw new Error(
      'KYC_IDENTITY_SALT environment variable is not set; refusing to hash identity data with a default salt'
    );
  }
  return salt;
}

/**
 * Salted SHA-256 of a personal identifier, hex-encoded.
 *
 * Used for national ids and land document references so the database holds a
 * comparable digest (equality checks, duplicate detection) without holding the
 * identifier itself.
 */
export function hashIdentifier(value: string): string {
  return createHash('sha256').update(`${identifierSalt()}:${value}`).digest('hex');
}
