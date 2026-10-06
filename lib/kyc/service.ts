/*
 * Farmer KYC service: validate → screen → persist, plus the reviewer path.
 *
 * All database access lives here so `eligibility.ts` and `validation.ts` stay
 * pure. Every function takes the pool as its first argument (the same
 * `Pick<Pool, 'query'>` seam used by `lib/analytics/sponsor-cohort-retention`)
 * so routes can share the singleton pool while tests pass a stub.
 */

import type { Pool } from 'pg';
import { getPool } from '@/lib/db/client';
import { screenCertificationEligibility } from './eligibility';
import { hashIdentifier, validateKycSubmission } from './validation';
import {
  type CertificationTier,
  type KycApplicationRecord,
  type KycApplicationStatus,
  type KycDecision,
  type KycScreeningResult,
  type KycValidationError,
  type OnChainKycStatus,
  toOnChainKycStatus,
} from './types';

/** The slice of a `pg.Pool` this service needs. */
export type KycDb = Pick<Pool, 'query'>;

export const KYC_REVIEW_QUEUE_STATUSES: readonly KycApplicationStatus[] = [
  'submitted',
  'under_review',
];

export interface SubmitKycOutcome {
  ok: boolean;
  errors?: KycValidationError[];
  application?: KycApplicationRecord;
}

export interface ListKycFilters {
  status?: KycApplicationStatus;
  farmerAddress?: string;
  region?: string;
  tier?: CertificationTier;
  limit?: number;
  offset?: number;
}

/** Verifier sign-off on an application's supporting evidence. */
export interface KycVerificationInput {
  /** The identity document was checked against the person. */
  identityVerified: boolean;
  /** The land claim was walked or otherwise confirmed. */
  landVerified: boolean;
  /** Defaults to now; overridable so backfills keep their real timestamp. */
  verifiedAt?: string;
}

/** Row shape returned by the queries below. */
interface KycRow {
  id: string;
  farmer_address: string;
  full_name: string;
  national_id_hash: string;
  phone_number: string;
  village: string;
  date_of_birth: Date | string;
  document_type: string;
  document_reference_hash: string | null;
  identity_verified_at: Date | string | null;
  ownership_type: string;
  plot_size_hectares: string | number;
  latitude: string | number;
  longitude: string | number;
  region: string;
  land_verified_at: Date | string | null;
  years_of_experience: string | number;
  primary_crop: string;
  secondary_crops: string[] | null;
  soil_type: string;
  training_programmes: string[] | null;
  jurisdiction_flags: number;
  required_jurisdiction_flags: number;
  active_sanctions: string[] | null;
  consent_granted: boolean;
  status: string;
  screening: KycScreeningResult | null;
  decision: KycDecision | null;
  submitted_at: Date | string;
  updated_at: Date | string;
}

/** `DATE` columns arrive as Date objects; normalise to `YYYY-MM-DD`. */
function toIsoDate(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return value.slice(0, 10);
}

function toIsoTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toNumber(value: string | number): number {
  return typeof value === 'number' ? value : Number.parseFloat(value);
}

function mapRow(row: KycRow): KycApplicationRecord {
  return {
    id: row.id,
    farmerAddress: row.farmer_address,
    fullName: row.full_name,
    nationalIdHash: row.national_id_hash,
    phoneNumber: row.phone_number,
    village: row.village,
    dateOfBirth: toIsoDate(row.date_of_birth),
    documentType: row.document_type as KycApplicationRecord['documentType'],
    documentReferenceHash: row.document_reference_hash,
    identityVerifiedAt: row.identity_verified_at
      ? toIsoTimestamp(row.identity_verified_at)
      : null,
    ownershipType: row.ownership_type as KycApplicationRecord['ownershipType'],
    plotSizeHectares: toNumber(row.plot_size_hectares),
    gpsCoordinates: {
      latitude: toNumber(row.latitude),
      longitude: toNumber(row.longitude),
    },
    region: row.region,
    landVerifiedAt: row.land_verified_at
      ? toIsoTimestamp(row.land_verified_at)
      : null,
    yearsOfExperience: toNumber(row.years_of_experience),
    primaryCrop: row.primary_crop,
    secondaryCrops: row.secondary_crops ?? [],
    soilType: row.soil_type,
    trainingProgrammes: row.training_programmes ?? [],
    jurisdictionFlags: row.jurisdiction_flags,
    requiredJurisdictionFlags: row.required_jurisdiction_flags,
    activeSanctions: row.active_sanctions ?? [],
    consentGranted: row.consent_granted,
    status: row.status as KycApplicationStatus,
    screening: row.screening as KycScreeningResult,
    decision: row.decision,
    submittedAt: toIsoTimestamp(row.submitted_at),
    updatedAt: toIsoTimestamp(row.updated_at),
  };
}

const SELECT_COLUMNS = `
  id, farmer_address, full_name, national_id_hash, phone_number, village,
  date_of_birth, document_type, document_reference_hash, identity_verified_at,
  ownership_type, plot_size_hectares, latitude, longitude, region,
  land_verified_at, years_of_experience,
  primary_crop, secondary_crops, soil_type, training_programmes,
  jurisdiction_flags, required_jurisdiction_flags, active_sanctions,
  consent_granted, status, screening, decision, submitted_at, updated_at
`;

export class KycService {
  constructor(private readonly db: KycDb) {}

  /**
   * Accept a submission: validate, screen, then persist both.
   *
   * The screening verdict is stored alongside the application and never
   * recomputed on read, so a later change to the ruleset cannot silently
   * re-classify an application that was already reviewed. Re-screening is an
   * explicit operation (`rescreenApplication`).
   */
  async submitApplication(body: unknown): Promise<SubmitKycOutcome> {
    const validation = validateKycSubmission(body);
    if (!validation.valid || !validation.input) {
      return { ok: false, errors: validation.errors };
    }

    const input = validation.input;
    const screening = screenCertificationEligibility(input);

    // An application that fails a blocking gate is recorded as rejected up
    // front rather than parked in the review queue, so reviewers only ever see
    // cases that could still be approved.
    const status: KycApplicationStatus = screening.eligible ? 'submitted' : 'rejected';

    const { rows } = await this.db.query<KycRow>(
      `INSERT INTO farmer_kyc_applications (
         farmer_address, full_name, national_id_hash, phone_number, village,
         date_of_birth, document_type, document_reference_hash, ownership_type,
         plot_size_hectares, latitude, longitude, region, years_of_experience,
         primary_crop, secondary_crops, soil_type, training_programmes,
         jurisdiction_flags, required_jurisdiction_flags, active_sanctions,
         consent_granted, status, screening
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6::date, $7, $8, $9,
         $10, $11, $12, $13, $14,
         $15, $16, $17, $18,
         $19, $20, $21,
         $22, $23, $24::jsonb
       )
       RETURNING ${SELECT_COLUMNS}`,
      [
        input.farmerAddress,
        input.identity.fullName,
        hashIdentifier(input.identity.nationalId),
        input.identity.phoneNumber,
        input.identity.village,
        input.identity.dateOfBirth,
        input.identity.documentType,
        input.identity.documentReference
          ? hashIdentifier(input.identity.documentReference)
          : null,
        input.land.ownershipType,
        input.land.plotSizeHectares,
        input.land.gpsCoordinates.latitude,
        input.land.gpsCoordinates.longitude,
        input.land.region,
        input.experience.yearsOfExperience,
        input.experience.primaryCrop,
        input.experience.secondaryCrops ?? [],
        input.experience.soilType,
        input.experience.trainingProgrammes ?? [],
        input.certification.jurisdictionFlags,
        input.certification.requiredJurisdictionFlags,
        input.certification.activeSanctions ?? [],
        input.consentGranted,
        status,
        JSON.stringify(screening),
      ]
    );

    const application = mapRow(rows[0]);

    // Eligibility that fails only on advisories is still worth a look, so flag
    // it in the logs rather than leaving reviewers to infer it from the tier.
    if (screening.tier === 'provisional') {
      console.warn('[kyc] provisional certification cohort', {
        applicationId: application.id,
        region: application.region,
        advisories: screening.advisories,
      });
    }

    return { ok: true, application };
  }

  async getApplication(id: string): Promise<KycApplicationRecord | null> {
    const { rows } = await this.db.query<KycRow>(
      `SELECT ${SELECT_COLUMNS} FROM farmer_kyc_applications WHERE id = $1`,
      [id]
    );
    return rows.length > 0 ? mapRow(rows[0]) : null;
  }

  /**
   * The reviewer worklist. Defaults to the open queue so the common call
   * (`GET /api/kyc/applications`) does not page through settled cases.
   */
  async listApplications(filters: ListKycFilters = {}): Promise<KycApplicationRecord[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    const placeholder = (value: unknown): string => {
      params.push(value);
      return `$${params.length}`;
    };

    if (filters.status) {
      conditions.push(`status = ${placeholder(filters.status)}`);
    } else {
      conditions.push(
        `status IN (${KYC_REVIEW_QUEUE_STATUSES.map((s) => placeholder(s)).join(', ')})`
      );
    }

    if (filters.farmerAddress) {
      conditions.push(`farmer_address = ${placeholder(filters.farmerAddress)}`);
    }

    if (filters.region) {
      conditions.push(`region = ${placeholder(filters.region)}`);
    }

    if (filters.tier) {
      conditions.push(`screening ->> 'tier' = ${placeholder(filters.tier)}`);
    }

    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const offset = Math.max(filters.offset ?? 0, 0);
    const limitPlaceholder = placeholder(limit);
    const offsetPlaceholder = placeholder(offset);

    const { rows } = await this.db.query<KycRow>(
      `SELECT ${SELECT_COLUMNS}
         FROM farmer_kyc_applications
        WHERE ${conditions.join(' AND ')}
        ORDER BY submitted_at ASC
        LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
      params
    );

    return rows.map(mapRow);
  }

  /**
   * Record a reviewer decision.
   *
   * `approve` is refused when the stored screening found a blocking failure —
   * the reviewer cannot overrule the eligibility gates, only the queue. A
   * reviewer who believes the screening is wrong should fix the underlying
   * evidence and re-screen, which keeps the audit trail honest.
   */
  async recordDecision(
    id: string,
    decision: KycDecision
  ): Promise<{ ok: boolean; error?: string; application?: KycApplicationRecord }> {
    const existing = await this.getApplication(id);
    if (!existing) {
      return { ok: false, error: `KYC application ${id} not found` };
    }

    if (decision.decision === 'approve' && !existing.screening.eligible) {
      return {
        ok: false,
        error: `Application ${id} failed blocking requirements and cannot be approved: ${existing.screening.blockers.join(', ')}`,
      };
    }

    if (existing.status === 'approved' || existing.status === 'rejected') {
      return {
        ok: false,
        error: `Application ${id} is already settled (${existing.status})`,
      };
    }

    const status: KycApplicationStatus =
      decision.decision === 'approve' ? 'approved' : 'rejected';

    const { rows } = await this.db.query<KycRow>(
      `UPDATE farmer_kyc_applications
          SET status = $2, decision = $3::jsonb, updated_at = NOW()
        WHERE id = $1
        RETURNING ${SELECT_COLUMNS}`,
      [id, status, JSON.stringify(decision)]
    );

    return { ok: true, application: mapRow(rows[0]) };
  }

  /**
   * Record verifier sign-off on the identity document and/or the land claim.
   *
   * This is the step that makes an application eligible: `identity_verified`
   * and `land_proof_verified` are blocking gates, and a farmer cannot satisfy
   * them by submitting data (see `validateKycSubmission`, which refuses to read
   * `verifiedAt` from a request body). Screening is re-run immediately so the
   * stored verdict always reflects the newly evidenced state.
   */
  async recordVerification(
    id: string,
    input: KycVerificationInput
  ): Promise<{ ok: boolean; error?: string; application?: KycApplicationRecord }> {
    const existing = await this.getApplication(id);
    if (!existing) {
      return { ok: false, error: `KYC application ${id} not found` };
    }

    if (!input.identityVerified && !input.landVerified) {
      return {
        ok: false,
        error: 'At least one of identityVerified or landVerified must be true',
      };
    }

    if (existing.status === 'approved' || existing.status === 'rejected') {
      return {
        ok: false,
        error: `Application ${id} is already settled (${existing.status})`,
      };
    }

    const verifiedAt = input.verifiedAt ?? new Date().toISOString();

    await this.db.query(
      `UPDATE farmer_kyc_applications
          SET identity_verified_at = CASE WHEN $2 THEN $4::timestamptz ELSE identity_verified_at END,
              land_verified_at     = CASE WHEN $3 THEN $4::timestamptz ELSE land_verified_at END,
              updated_at           = NOW()
        WHERE id = $1`,
      [id, input.identityVerified, input.landVerified, verifiedAt]
    );

    // Re-screen so the stored verdict moves with the evidence.
    const application = await this.rescreenApplication(id);
    if (!application) {
      return { ok: false, error: `KYC application ${id} disappeared during re-screening` };
    }

    return { ok: true, application };
  }

  /**
   * Re-run screening against the current ruleset and persist the new verdict.
   *
   * Used after the evidence on an application has been corrected, and when a
   * ruleset version bump needs historical cases re-evaluated.
   */
  async rescreenApplication(id: string): Promise<KycApplicationRecord | null> {
    const existing = await this.getApplication(id);
    if (!existing) return null;

    const screening = screenCertificationEligibility({
      farmerAddress: existing.farmerAddress,
      identity: {
        fullName: existing.fullName,
        // The raw id is unrecoverable by design; screening never reads it, and
        // the stored digest already proves what was checked.
        nationalId: existing.nationalIdHash,
        phoneNumber: existing.phoneNumber,
        village: existing.village,
        dateOfBirth: existing.dateOfBirth,
        documentType: existing.documentType,
        verifiedAt: existing.identityVerifiedAt ?? undefined,
      },
      land: {
        ownershipType: existing.ownershipType,
        documentReference: existing.documentReferenceHash ?? undefined,
        plotSizeHectares: existing.plotSizeHectares,
        gpsCoordinates: existing.gpsCoordinates,
        region: existing.region,
        verifiedAt: existing.landVerifiedAt ?? undefined,
      },
      experience: {
        yearsOfExperience: existing.yearsOfExperience,
        primaryCrop: existing.primaryCrop,
        secondaryCrops: existing.secondaryCrops,
        soilType: existing.soilType,
        trainingProgrammes: existing.trainingProgrammes,
      },
      certification: {
        jurisdictionFlags: existing.jurisdictionFlags,
        requiredJurisdictionFlags: existing.requiredJurisdictionFlags,
        activeSanctions: existing.activeSanctions,
      },
      consentGranted: existing.consentGranted,
    });

    const { rows } = await this.db.query<KycRow>(
      `UPDATE farmer_kyc_applications
          SET screening = $2::jsonb, updated_at = NOW()
        WHERE id = $1
        RETURNING ${SELECT_COLUMNS}`,
      [id, JSON.stringify(screening)]
    );

    return rows.length > 0 ? mapRow(rows[0]) : null;
  }

  /**
   * The status a verifier should attest on-chain for this application.
   *
   * Exposed so the caller that submits `attest_kyc` never has to translate the
   * off-chain vocabulary itself — see `toOnChainKycStatus`.
   */
  onChainStatusFor(application: KycApplicationRecord): OnChainKycStatus {
    return toOnChainKycStatus(application.status);
  }
}

let service: KycService | null = null;

/** Singleton service bound to the shared pool. */
export function getKycService(): KycService {
  if (!service) {
    service = new KycService(getPool());
  }
  return service;
}
