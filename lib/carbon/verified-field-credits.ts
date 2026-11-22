import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { StrKey } from '@stellar/stellar-sdk';
import type { NetworkType } from '@/lib/types/wallet';
import { recordFieldCredit } from '@/lib/stellar/carbon-credits-client';

export interface FieldSample {
  id: string;
  sampleDate: string | Date;
  co2Kg: number | string | null;
  measurementMethod: string | null;
  verificationStatus: string;
  verifiedBy: string | null;
  verifiedAt: string | Date | null;
  projectId?: string;
}

export interface EligibleFieldCredit {
  treeId: number;
  treeRef: string;
  sponsorWallet: string;
  projectId: string;
  baselineSampleId: string;
  latestSampleId: string;
  baselineDate: string;
  latestDate: string;
  measuredDeltaKg: number;
  amountGrams: number;
  evidenceDigest: string;
}

export type FieldCreditCalculation =
  | { eligible: true; credit: EligibleFieldCredit }
  | {
      eligible: false;
      reason:
        | 'insufficient_verified_samples'
        | 'issued_baseline_missing'
        | 'no_positive_delta'
        | 'amount_out_of_range';
    };

const ALLOWED_METHODS = new Set(['allometric', 'destructive']);

function normalizedDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

function normalizedVerifiedAt(value: string | Date | null): string | null {
  if (!value) return null;
  const instant = value instanceof Date ? value : new Date(value);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

function numericCo2(value: number | string | null): number | null {
  if (value === null || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function calculateFieldCredit(
  samples: FieldSample[],
  context: Omit<
    EligibleFieldCredit,
    | 'baselineSampleId'
    | 'latestSampleId'
    | 'baselineDate'
    | 'latestDate'
    | 'measuredDeltaKg'
    | 'amountGrams'
    | 'evidenceDigest'
  >,
  lastIssuedSampleId?: string | null
): FieldCreditCalculation {
  const eligibleSamples = samples
    .filter(
      (sample) =>
        sample.verificationStatus === 'verified' &&
        Boolean(sample.verifiedBy?.trim()) &&
        normalizedVerifiedAt(sample.verifiedAt) !== null &&
        sample.measurementMethod !== null &&
        (!sample.projectId || sample.projectId === context.projectId) &&
        ALLOWED_METHODS.has(sample.measurementMethod) &&
        numericCo2(sample.co2Kg) !== null
    )
    .sort((left, right) => {
      const dateOrder = normalizedDate(left.sampleDate).localeCompare(
        normalizedDate(right.sampleDate)
      );
      return dateOrder || left.id.localeCompare(right.id);
    });

  let baselineIndex = 0;
  if (lastIssuedSampleId) {
    const previousIndex = eligibleSamples.findIndex((sample) => sample.id === lastIssuedSampleId);
    if (previousIndex < 0) return { eligible: false, reason: 'issued_baseline_missing' };
    baselineIndex = previousIndex;
  }

  const baseline = eligibleSamples[baselineIndex];
  const latest = eligibleSamples.at(-1);
  if (!baseline || !latest || baseline.id === latest.id) {
    return { eligible: false, reason: 'insufficient_verified_samples' };
  }

  const baselineKg = numericCo2(baseline.co2Kg);
  const latestKg = numericCo2(latest.co2Kg);
  if (baselineKg === null || latestKg === null) {
    return { eligible: false, reason: 'insufficient_verified_samples' };
  }

  const measuredDeltaKg = latestKg - baselineKg;
  if (!Number.isFinite(measuredDeltaKg) || measuredDeltaKg <= 0) {
    return { eligible: false, reason: 'no_positive_delta' };
  }

  // research_samples.co2_kg is measured in kilograms. The Soroban contract
  // accounts in grams, so round only at the final unit conversion.
  const amountGrams = Math.round(measuredDeltaKg * 1_000);
  if (!Number.isSafeInteger(amountGrams) || amountGrams <= 0) {
    return { eligible: false, reason: 'amount_out_of_range' };
  }

  const digestPayload = JSON.stringify({
    version: 1,
    sponsorWallet: context.sponsorWallet,
    treeId: context.treeId,
    projectId: context.projectId,
    baseline: {
      id: baseline.id,
      date: normalizedDate(baseline.sampleDate),
      co2Kg: baselineKg.toFixed(3),
      method: baseline.measurementMethod,
      verifiedBy: baseline.verifiedBy?.trim(),
      verifiedAt: normalizedVerifiedAt(baseline.verifiedAt),
    },
    latest: {
      id: latest.id,
      date: normalizedDate(latest.sampleDate),
      co2Kg: latestKg.toFixed(3),
      method: latest.measurementMethod,
      verifiedBy: latest.verifiedBy?.trim(),
      verifiedAt: normalizedVerifiedAt(latest.verifiedAt),
    },
    measuredDeltaKg: measuredDeltaKg.toFixed(3),
    amountGrams,
  });
  const evidenceDigest = createHash('sha256').update(digestPayload).digest('hex');

  return {
    eligible: true,
    credit: {
      ...context,
      baselineSampleId: baseline.id,
      latestSampleId: latest.id,
      baselineDate: normalizedDate(baseline.sampleDate),
      latestDate: normalizedDate(latest.sampleDate),
      measuredDeltaKg: Number(measuredDeltaKg.toFixed(3)),
      amountGrams,
      evidenceDigest,
    },
  };
}

interface SponsorTreeRow {
  tree_id: number;
  tree_ref: string;
  sponsor_wallet: string;
  project_id: string;
  sample_id: string;
  sample_date: string;
  co2_kg: number | string | null;
  measurement_method: string | null;
  verification_status: string;
  verified_by: string | null;
  verified_at: string | Date | null;
  last_issued_sample_id: string | null;
  last_issued_project_id: string | null;
}

async function findEligibleCredits(
  client: Pool | PoolClient,
  sponsorWallet: string
): Promise<EligibleFieldCredit[]> {
  const { rows } = await client.query<SponsorTreeRow>(
    `SELECT t.id AS tree_id, t.tree_ref, t.sponsor_wallet,
            rp.plot_code AS project_id, rs.id AS sample_id, rs.sample_date,
            rs.co2_kg, rs.measurement_method, rs.verification_status,
            rs.verified_by, rs.verified_at,
            issued.latest_sample_id AS last_issued_sample_id,
            issued.latest_project_id AS last_issued_project_id
       FROM trees t
       JOIN research_samples rs ON rs.tree_id = t.id
       JOIN research_plots rp ON rp.id = rs.plot_id
       LEFT JOIN LATERAL (
         SELECT fci.latest_sample_id, fci.project_id AS latest_project_id
           FROM field_credit_issuances fci
          WHERE fci.tree_id = t.id AND fci.status = 'confirmed'
          ORDER BY fci.created_at DESC, fci.id DESC
          LIMIT 1
       ) issued ON TRUE
      WHERE t.sponsor_wallet = $1
        AND t.deleted_at IS NULL
        AND t.status = 'verified'
        AND rs.verification_status = 'verified'
        AND rs.verified_at IS NOT NULL
        AND rs.verified_by IS NOT NULL
        AND rs.measurement_method IN ('allometric', 'destructive')
        AND rs.co2_kg IS NOT NULL
      ORDER BY t.id, rs.sample_date, rs.id`,
    [sponsorWallet]
  );

  const groups = new Map<number, SponsorTreeRow[]>();
  for (const row of rows) {
    const group = groups.get(row.tree_id) ?? [];
    group.push(row);
    groups.set(row.tree_id, group);
  }

  const results: EligibleFieldCredit[] = [];
  for (const [treeId, treeRows] of groups) {
    const latestRow = treeRows.at(-1);
    if (!latestRow) continue;
    const calculation = calculateFieldCredit(
      treeRows.map((row) => ({
        id: row.sample_id,
        sampleDate: row.sample_date,
        co2Kg: row.co2_kg,
        measurementMethod: row.measurement_method,
        verificationStatus: row.verification_status,
        verifiedBy: row.verified_by,
        verifiedAt: row.verified_at,
        projectId: row.project_id,
      })),
      {
        treeId,
        treeRef: latestRow.tree_ref,
        sponsorWallet: latestRow.sponsor_wallet,
        projectId: latestRow.project_id,
      },
      latestRow.last_issued_project_id === latestRow.project_id
        ? latestRow.last_issued_sample_id
        : null
    );
    if (calculation.eligible) results.push(calculation.credit);
  }
  return results;
}

export function listEligibleFieldCredits(
  pool: Pool,
  sponsorWallet: string
): Promise<EligibleFieldCredit[]> {
  return findEligibleCredits(pool, sponsorWallet);
}

export class FieldCreditAlreadyReservedError extends Error {
  constructor() {
    super('This verified sample is already reserved for issuance or has already been issued.');
    this.name = 'FieldCreditAlreadyReservedError';
  }
}

export class FieldCreditNotEligibleError extends Error {
  constructor() {
    super('No new positive verified CO2 measurement delta is available for this tree.');
    this.name = 'FieldCreditNotEligibleError';
  }
}

/**
 * Reserve one tree's latest verified measurement delta before submitting the
 * Soroban issuance transaction. Pending rows are deliberately not retried
 * automatically: RPC timeouts can leave transaction finality ambiguous.
 */
export async function issueFieldCreditForTree(
  pool: Pool,
  input: { sponsorWallet: string; treeId: number; network: NetworkType; contractId: string }
): Promise<{ credit: EligibleFieldCredit; transactionHash: string }> {
  if (!StrKey.isValidEd25519PublicKey(input.sponsorWallet)) {
    throw new Error('Sponsor wallet is not a valid Stellar public key.');
  }

  const client = await pool.connect();
  let credit: EligibleFieldCredit;
  let issuanceId: string;
  try {
    await client.query('BEGIN');
    const treeResult = await client.query<{ id: number; tree_ref: string; sponsor_wallet: string }>(
      `SELECT id, tree_ref, sponsor_wallet FROM trees
        WHERE id = $1 AND sponsor_wallet = $2 AND status = 'verified' AND deleted_at IS NULL
        FOR UPDATE`,
      [input.treeId, input.sponsorWallet]
    );
    const tree = treeResult.rows[0];
    if (!tree) throw new FieldCreditNotEligibleError();

    const sampleResult = await client.query<{
      id: string;
      sample_date: string;
      co2_kg: number | string | null;
      measurement_method: string | null;
      verification_status: string;
      verified_by: string | null;
      verified_at: string | Date | null;
      project_id: string;
    }>(
      `SELECT rs.id, rs.sample_date, rs.co2_kg, rs.measurement_method,
              rs.verification_status, rs.verified_by, rs.verified_at, rp.plot_code AS project_id
         FROM research_samples rs
         JOIN research_plots rp ON rp.id = rs.plot_id
        WHERE rs.tree_id = $1
        ORDER BY rs.sample_date, rs.id
        FOR SHARE OF rs`,
      [input.treeId]
    );
    const issuedResult = await client.query<{ latest_sample_id: string; project_id: string }>(
      `SELECT latest_sample_id, project_id FROM field_credit_issuances
        WHERE tree_id = $1 AND status = 'confirmed'
        ORDER BY created_at DESC, id DESC LIMIT 1`,
      [input.treeId]
    );
    const firstSample = sampleResult.rows[0];
    if (!firstSample) throw new FieldCreditNotEligibleError();
    const latestSample = sampleResult.rows.at(-1);
    const latestIssued = issuedResult.rows[0];
    const lastIssuedSampleId =
      latestIssued?.project_id === latestSample?.project_id ? latestIssued.latest_sample_id : null;

    const calculation = calculateFieldCredit(
      sampleResult.rows.map((row) => ({
        id: row.id,
        sampleDate: row.sample_date,
        co2Kg: row.co2_kg,
        measurementMethod: row.measurement_method,
        verificationStatus: row.verification_status,
        verifiedBy: row.verified_by,
        verifiedAt: row.verified_at,
        projectId: row.project_id,
      })),
      {
        treeId: tree.id,
        treeRef: tree.tree_ref,
        sponsorWallet: tree.sponsor_wallet,
        projectId: latestSample?.project_id ?? firstSample.project_id,
      },
      lastIssuedSampleId
    );
    if (!calculation.eligible) throw new FieldCreditNotEligibleError();
    credit = calculation.credit;

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO field_credit_issuances
        (tree_id, sponsor_wallet, project_id, baseline_sample_id, latest_sample_id,
         measured_delta_kg, amount_grams, evidence_digest, network, contract_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
       RETURNING id`,
      [
        credit.treeId,
        credit.sponsorWallet,
        credit.projectId,
        credit.baselineSampleId,
        credit.latestSampleId,
        credit.measuredDeltaKg,
        credit.amountGrams,
        credit.evidenceDigest,
        input.network,
        input.contractId,
      ]
    );
    issuanceId = inserted.rows[0]?.id;
    if (!issuanceId) throw new Error('Failed to reserve field-credit issuance.');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    if ((error as { code?: string })?.code === '23505') {
      throw new FieldCreditAlreadyReservedError();
    }
    throw error;
  } finally {
    client.release();
  }

  // The contract's digest-level uniqueness is the final on-chain idempotency
  // guard. If this call times out, leave the database reservation pending for
  // reconciliation; do not issue a different digest for the same samples.
  const transactionHash = await recordFieldCredit(
    input.sponsorWallet,
    credit.projectId,
    credit.amountGrams,
    credit.evidenceDigest,
    input.network
  );
  await pool.query(
    `UPDATE field_credit_issuances
        SET status = 'confirmed', transaction_hash = $1, confirmed_at = NOW()
      WHERE id = $2 AND status = 'pending'`,
    [transactionHash, issuanceId]
  );

  return { credit, transactionHash };
}
