/**
 * Farmer verification API — Farm-credit/stellar-app-os#1403
 *
 * A read-only, privacy-preserving view of a farmer's verification state for
 * third-party integrators: partner platforms, lenders, and financial
 * institutions. It composes the KYC record produced by `lib/kyc` into a verdict
 * on the three questions an external counterparty actually asks:
 *
 *   1. identity — has a verifier checked the person against their document?
 *   2. land     — has a verifier confirmed the plot and the declared tenure?
 *   3. credit   — is the farmer eligible for credit today, and on what tier?
 *
 * Privacy boundary
 * ----------------
 * Everything personal stays behind this module. Names, phone numbers, dates of
 * birth, villages, and the salted national-id / land-document digests are never
 * projected into a report: a caller learns *that* a check passed and *when*,
 * never the evidence behind it. This is the same stance the `kyc-attestation`
 * contract takes on-chain — "no PII ever appears in the transaction or ledger
 * state". Disclosure additionally requires the farmer's recorded consent; a
 * record without consent is reported as absent (`consent_denied`) rather than
 * returned partially redacted, so a caller cannot infer anything from the
 * shape of a response it was not entitled to receive.
 *
 * Data access is a pure `Pick<Pool, 'query'>` seam — the same one used by
 * `lib/analytics/sponsor-cohort-retention` and `lib/kyc/service` — so routes
 * pass the shared pool and tests pass a stub without touching a database.
 */

import type { Pool } from 'pg';
import {
  DOCUMENTARY_TENURE_TYPES,
  INFORMAL_TENURE_TYPES,
  toOnChainKycStatus,
  type CertificationTier,
  type GpsCoordinates,
  type IdentityDocumentType,
  type KycApplicationStatus,
  type KycRequirement,
  type KycScreeningResult,
  type LandOwnershipType,
} from '@/lib/kyc/types';

/** The slice of a `pg.Pool` this service needs. */
export type FarmerVerificationDb = Pick<Pool, 'query'>;

/** Maximum number of addresses accepted by a single batch verification call. */
export const MAX_BATCH_ADDRESSES = 100;

/**
 * Stellar public keys are 56-char base32 starting with `G`. The same shape
 * check `lib/kyc/validation.ts` applies on submission.
 */
const STELLAR_ADDRESS = /^G[A-Z2-7]{55}$/;

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

export function isStellarAddress(value: unknown): value is string {
  return typeof value === 'string' && STELLAR_ADDRESS.test(value.trim());
}

// ── Report shape ──────────────────────────────────────────────────────────────

/**
 * Identity verification, reduced to the assertion a counterparty may rely on.
 * The document type is the only detail that survives; the reference itself and
 * every personal identifier remain in the KYC store.
 */
export interface FarmerVerificationIdentity {
  verified: boolean;
  /** When a verifier checked the document against the person, else null. */
  verifiedAt: string | null;
  documentType: IdentityDocumentType | null;
}

/**
 * Land ownership verification. Coordinates accompany the claim because a
 * lender or insurer needs to place the plot; they are only ever returned once
 * consent has been confirmed.
 */
export interface FarmerVerificationLand {
  verified: boolean;
  /** When a verifier walked or otherwise confirmed the plot, else null. */
  verifiedAt: string | null;
  ownershipType: LandOwnershipType | null;
  plotSizeHectares: number | null;
  region: string | null;
  gpsCoordinates: GpsCoordinates | null;
}

/** The stored certification screen, surfaced verbatim. */
export interface FarmerVerificationCertification {
  eligible: boolean;
  tier: CertificationTier;
  /** Failed blocking gates, in the screening requirement vocabulary. */
  blockers: KycRequirement[];
  /** Failed advisory gates — eligible, but at reduced confidence. */
  advisories: KycRequirement[];
  rulesetVersion: string;
}

/**
 * Credit availability, derived from the stored screening verdict.
 *
 * `available` is true only when the application is still live, the screening
 * found no blocking gate, and the farmer carries no active sanctions. `tier`
 * mirrors the certification tier so a provisional cohort is visible to the
 * lender instead of being flattened to a boolean.
 */
export interface FarmerVerificationCredit {
  available: boolean;
  tier: CertificationTier;
  /** Failed gates blocking credit; empty when `available` is true. */
  blockers: KycRequirement[];
  /** Failed advisory gates that reduce confidence without blocking. */
  advisories: KycRequirement[];
  /** True when the application is already settled (rejected or expired). */
  applicationSettled: boolean;
  /** False when the farmer carries at least one active sanction. */
  sanctionsClear: boolean;
}

export interface FarmerVerificationReport {
  farmerAddress: string;
  apiVersion: 'v1' | 'v2';
  /** On-chain vocabulary: approved → verified, open → pending, plus rejected/expired. */
  verificationStatus: 'verified' | 'pending' | 'rejected' | 'expired';
  /** Overall: true only once the application has been approved. */
  verified: boolean;
  identity: FarmerVerificationIdentity;
  land: FarmerVerificationLand;
  certification: FarmerVerificationCertification;
  credit: FarmerVerificationCredit;
  consent: { granted: boolean };
  /** Server time the report was assembled. */
  checkedAt: string;
}

export type FarmerVerificationLookup =
  | { ok: true; report: FarmerVerificationReport }
  | { ok: false; reason: 'not_found' | 'consent_denied' };

export interface FarmerVerificationBatch {
  requested: number;
  count: number;
  verified: number;
  reports: FarmerVerificationReport[];
  notFound: string[];
  consentDenied: string[];
}

export interface AddressParseResult {
  ok: boolean;
  addresses: string[];
  errors: string[];
}

// ── Row mapping ───────────────────────────────────────────────────────────────

/** Only the columns a third-party report is allowed to read. */
interface VerificationRow {
  farmer_address: string;
  identity_verified_at: Date | string | null;
  document_type: string | null;
  ownership_type: string | null;
  plot_size_hectares: string | number | null;
  latitude: string | number | null;
  longitude: string | number | null;
  region: string | null;
  land_verified_at: Date | string | null;
  consent_granted: boolean;
  status: string;
  screening: KycScreeningResult | null;
  active_sanctions: string[] | null;
  submitted_at: Date | string;
  updated_at: Date | string;
}

function toIsoTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toIsoTimestampOrNull(value: Date | string | null): string | null {
  return value === null ? null : toIsoTimestamp(value);
}

function toNumberOrNull(value: string | number | null): number | null {
  if (value === null) return null;
  return typeof value === 'number' ? value : Number.parseFloat(value);
}

function asDocumentType(value: string | null): IdentityDocumentType | null {
  return value && (IDENTITY_DOCUMENT_TYPES as readonly string[]).includes(value)
    ? (value as IdentityDocumentType)
    : null;
}

function asOwnershipType(value: string | null): LandOwnershipType | null {
  return value && (LAND_OWNERSHIP_TYPES as readonly string[]).includes(value)
    ? (value as LandOwnershipType)
    : null;
}

/**
 * A stored screening is written with every application, so a null here means a
 * row predates the screening column. Treat it as "nothing has been screened"
 * rather than inventing an eligible verdict.
 */
function asScreening(
  value: KycScreeningResult | null,
  fallbackAt: Date | string
): KycScreeningResult {
  if (value) return value;
  return {
    eligible: false,
    tier: 'none',
    checks: [],
    blockers: [],
    advisories: [],
    rulesetVersion: 'unavailable',
    screenedAt: toIsoTimestamp(fallbackAt),
  };
}

// ── Credit evaluation ─────────────────────────────────────────────────────────

const SETTLED_STATUSES: readonly KycApplicationStatus[] = ['rejected', 'expired'];

/** Pure so the credit rule can be exercised without a database. */
export function evaluateCredit(
  status: KycApplicationStatus,
  screening: KycScreeningResult,
  activeSanctions: readonly string[]
): FarmerVerificationCredit {
  const applicationSettled = SETTLED_STATUSES.includes(status);
  const sanctionsClear = activeSanctions.length === 0;
  const available = !applicationSettled && sanctionsClear && screening.eligible;

  return {
    available,
    tier: available ? screening.tier : 'none',
    blockers: available ? [] : screening.blockers,
    advisories: screening.advisories,
    applicationSettled,
    sanctionsClear,
  };
}

function buildReport(row: VerificationRow, apiVersion: 'v1' | 'v2'): FarmerVerificationReport {
  const status = row.status as KycApplicationStatus;
  const screening = asScreening(row.screening, row.updated_at);
  const activeSanctions = row.active_sanctions ?? [];
  const latitude = toNumberOrNull(row.latitude);
  const longitude = toNumberOrNull(row.longitude);

  return {
    farmerAddress: row.farmer_address,
    apiVersion,
    verificationStatus: toOnChainKycStatus(status),
    verified: status === 'approved',
    identity: {
      verified: row.identity_verified_at !== null,
      verifiedAt: toIsoTimestampOrNull(row.identity_verified_at),
      documentType: asDocumentType(row.document_type),
    },
    land: {
      verified: row.land_verified_at !== null,
      verifiedAt: toIsoTimestampOrNull(row.land_verified_at),
      ownershipType: asOwnershipType(row.ownership_type),
      plotSizeHectares: toNumberOrNull(row.plot_size_hectares),
      region: row.region,
      gpsCoordinates: latitude !== null && longitude !== null ? { latitude, longitude } : null,
    },
    certification: {
      eligible: screening.eligible,
      tier: screening.tier,
      blockers: screening.blockers,
      advisories: screening.advisories,
      rulesetVersion: screening.rulesetVersion,
    },
    credit: evaluateCredit(status, screening, activeSanctions),
    consent: { granted: row.consent_granted },
    checkedAt: new Date().toISOString(),
  };
}

// ── Lookups ───────────────────────────────────────────────────────────────────

const SELECT_VERIFICATION_COLUMNS = `
  farmer_address, identity_verified_at, document_type,
  ownership_type, plot_size_hectares, latitude, longitude, region,
  land_verified_at, consent_granted, status, screening,
  active_sanctions, submitted_at, updated_at
`;

/**
 * Verify a single farmer.
 *
 * The newest approved application wins; failing that the most recent
 * application is used, so a pending or rejected case still yields a definite
 * answer instead of a bare 404. Returns `consent_denied` — not a redacted
 * report — when the farmer has not agreed to third-party disclosure.
 */
export async function getFarmerVerification(
  db: FarmerVerificationDb,
  farmerAddress: string,
  apiVersion: 'v1' | 'v2' = 'v2'
): Promise<FarmerVerificationLookup> {
  const { rows } = await db.query<VerificationRow>(
    `SELECT ${SELECT_VERIFICATION_COLUMNS}
       FROM farmer_kyc_applications
      WHERE farmer_address = $1
      ORDER BY CASE WHEN status = 'approved' THEN 0 ELSE 1 END, submitted_at DESC
      LIMIT 1`,
    [farmerAddress]
  );

  const row = rows[0];
  if (!row) return { ok: false, reason: 'not_found' };
  if (!row.consent_granted) return { ok: false, reason: 'consent_denied' };

  return { ok: true, report: buildReport(row, apiVersion) };
}

/**
 * Verify a batch of farmers. Addresses are expected to be pre-validated and
 * de-duplicated by `parseVerificationAddresses`; the batch preserves request
 * order and buckets misses so a caller can tell "not a farmer" apart from
 * "farmer opted out".
 */
export async function verifyFarmers(
  db: FarmerVerificationDb,
  addresses: readonly string[],
  apiVersion: 'v1' | 'v2' = 'v2'
): Promise<FarmerVerificationBatch> {
  if (addresses.length === 0) {
    return {
      requested: 0,
      count: 0,
      verified: 0,
      reports: [],
      notFound: [],
      consentDenied: [],
    };
  }

  // Fetch a portfolio in one round trip. DISTINCT ON applies the same
  // precedence as the single-farmer lookup: prefer an approved application,
  // otherwise use the newest application for that farmer.
  const { rows } = await db.query<VerificationRow>(
    `SELECT DISTINCT ON (farmer_address) ${SELECT_VERIFICATION_COLUMNS}
       FROM farmer_kyc_applications
      WHERE farmer_address = ANY($1::text[])
      ORDER BY farmer_address,
               CASE WHEN status = 'approved' THEN 0 ELSE 1 END,
               submitted_at DESC`,
    [addresses]
  );

  const rowsByAddress = new Map(rows.map((row) => [row.farmer_address, row]));

  const batch: FarmerVerificationBatch = {
    requested: addresses.length,
    count: 0,
    verified: 0,
    reports: [],
    notFound: [],
    consentDenied: [],
  };

  for (const address of addresses) {
    const row = rowsByAddress.get(address);
    if (!row) {
      batch.notFound.push(address);
      continue;
    }
    if (!row.consent_granted) {
      batch.consentDenied.push(address);
      continue;
    }

    const report = buildReport(row, apiVersion);
    batch.reports.push(report);
    batch.count += 1;
    if (report.verified) batch.verified += 1;
  }

  return batch;
}

/**
 * Validate and normalise a batch request body.
 *
 * Rejects the whole request when any entry is malformed rather than silently
 * dropping it: a lender asking about 50 farmers must not receive 49 answers
 * and a 200. Duplicates are collapsed so the same address is only looked up
 * once.
 */
export function parseVerificationAddresses(body: unknown): AddressParseResult {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, addresses: [], errors: ['Request body must be a JSON object.'] };
  }

  const raw = (body as { addresses?: unknown }).addresses;
  if (!Array.isArray(raw) || raw.length === 0) {
    return {
      ok: false,
      addresses: [],
      errors: ['addresses must be a non-empty array of Stellar public keys.'],
    };
  }

  const errors: string[] = [];
  if (raw.length > MAX_BATCH_ADDRESSES) {
    errors.push(`addresses must contain at most ${MAX_BATCH_ADDRESSES} entries.`);
  }

  const addresses: string[] = [];
  raw.forEach((value, index) => {
    if (!isStellarAddress(value)) {
      errors.push(`addresses[${index}] must be a 56-character Stellar public key starting with G.`);
      return;
    }
    const normalised = (value as string).trim();
    if (!addresses.includes(normalised)) addresses.push(normalised);
  });

  return { ok: errors.length === 0, addresses, errors };
}
