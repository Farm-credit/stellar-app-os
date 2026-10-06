/**
 * lib/db/tax-documents.ts
 *
 * Data-access layer for farmer tax documentation (v2):
 *   * taxable payout income — `planter_payouts` (migration 009)
 *   * carbon credit sale income — `carbon_credit_sales` (migration 023)
 *   * generated tax documents — `tax_documents` (migration 023)
 *
 * The two income queries fall back gracefully when migration 023 has not been
 * applied yet (pg error code 42P01 = undefined_table): payouts reuse the
 * `v_planter_payouts_from_indexed` view, carbon credit sales resolve to an
 * empty list.  That keeps the endpoint usable on existing deployments instead
 * of returning a 500.
 *
 * All amounts are returned as JavaScript numbers (see lib/db/client.ts, which
 * parses BIGINT as number and we cast NUMERIC to float8 in SQL).
 */

import { getPool } from '@/lib/db/client';
import type { TaxableIncomeSource, TaxFormType } from '@/lib/tax/tax-reporting';

// ── Row shapes ────────────────────────────────────────────────────────────────

export interface PlanterIdentityRow {
  id: number;
  full_name: string;
  stellar_address: string;
  country_code: string | null;
  region: string | null;
}

export interface CarbonCreditSaleRow {
  id: number;
  planter_id: number;
  sale_ref: string;
  sold_at: Date;
  tax_year: number;
  credits_tons: number;
  price_per_ton: number;
  gross_amount: number;
  currency: string;
  asset_code: string;
  buyer_ref: string | null;
  project_ref: string | null;
  verification_standard: string | null;
  memo: string | null;
}

export interface TaxDocumentRow {
  id: number;
  planter_id: number;
  tax_year: number;
  form_type: TaxFormType;
  status: 'draft' | 'generated' | 'filed';
  gross_amount: number;
  record_count: number;
  payload: unknown;
  generated_by: string | null;
  generated_at: Date;
  updated_at: Date;
}

export interface SaveTaxDocumentParams {
  planterId: number;
  taxYear: number;
  formType: TaxFormType;
  status?: TaxDocumentRow['status'];
  grossAmount: number;
  recordCount: number;
  payload: unknown;
  generatedBy?: string | null;
}

interface TaxablePayoutRow {
  tx_hash: string;
  paid_at: Date;
  asset_code: string;
  amount: number;
  memo: string | null;
}

// ── Planter lookup ────────────────────────────────────────────────────────────

const PLANTER_COLUMNS = 'id, full_name, stellar_address, country_code, region';

/** Active (not soft-deleted) planter by internal id, or null. */
export async function findActivePlanterById(planterId: number): Promise<PlanterIdentityRow | null> {
  const pool = getPool();
  const result = await pool.query<PlanterIdentityRow>(
    `SELECT ${PLANTER_COLUMNS}
       FROM planters
      WHERE id = $1
        AND deleted_at IS NULL
      LIMIT 1`,
    [planterId]
  );
  return result.rows[0] ?? null;
}

/** Active (not soft-deleted) planter by Stellar address, or null. */
export async function findActivePlanterByAddress(
  stellarAddress: string
): Promise<PlanterIdentityRow | null> {
  const pool = getPool();
  const result = await pool.query<PlanterIdentityRow>(
    `SELECT ${PLANTER_COLUMNS}
       FROM planters
      WHERE stellar_address = $1
        AND deleted_at IS NULL
      LIMIT 1`,
    [stellarAddress]
  );
  return result.rows[0] ?? null;
}

// ── Income sources ────────────────────────────────────────────────────────────

const PAYOUTS_SQL = `
  SELECT
    tx_hash,
    paid_at,
    COALESCE(asset_code, 'XLM') AS asset_code,
    amount::float8               AS amount,
    memo
  FROM planter_payouts
  WHERE planter_id = $1
    AND tax_year   = $2
  ORDER BY paid_at ASC
`;

const PAYOUTS_FALLBACK_SQL = `
  SELECT
    tx_hash,
    paid_at,
    COALESCE(asset_code, 'XLM') AS asset_code,
    amount::float8               AS amount,
    memo
  FROM v_planter_payouts_from_indexed
  WHERE planter_id = $1
    AND tax_year   = $2
  ORDER BY paid_at ASC
`;

/**
 * Payout income for the planter/year as normalised taxable income sources.
 * Falls back to the indexed-transactions view when `planter_payouts` is absent.
 */
export async function getTaxablePayouts(params: {
  planterId: number;
  taxYear: number;
}): Promise<TaxableIncomeSource[]> {
  const pool = getPool();
  const { planterId, taxYear } = params;

  let rows: TaxablePayoutRow[];
  try {
    const result = await pool.query<TaxablePayoutRow>(PAYOUTS_SQL, [planterId, taxYear]);
    rows = result.rows;
  } catch (err: unknown) {
    if (!isUndefinedTableError(err)) throw err;
    const result = await pool.query<TaxablePayoutRow>(PAYOUTS_FALLBACK_SQL, [planterId, taxYear]);
    rows = result.rows;
  }

  return rows.map((row) => ({
    kind: 'payout' as const,
    reference: row.tx_hash,
    occurredAt: toIsoString(row.paid_at),
    amount: row.amount,
    currency: row.asset_code,
    assetCode: row.asset_code,
    memo: row.memo,
  }));
}

const CARBON_SALES_SQL = `
  SELECT
    id,
    planter_id,
    sale_ref,
    sold_at,
    tax_year,
    credits_tons::float8  AS credits_tons,
    price_per_ton::float8 AS price_per_ton,
    gross_amount::float8  AS gross_amount,
    currency,
    asset_code,
    buyer_ref,
    project_ref,
    verification_standard,
    memo
  FROM carbon_credit_sales
  WHERE planter_id = $1
    AND tax_year   = $2
  ORDER BY sold_at ASC
`;

/** Carbon credit sale rows for the planter/year (empty when migration 023 is absent). */
export async function getCarbonCreditSaleRows(params: {
  planterId: number;
  taxYear: number;
}): Promise<CarbonCreditSaleRow[]> {
  const pool = getPool();
  try {
    const result = await pool.query<CarbonCreditSaleRow>(CARBON_SALES_SQL, [
      params.planterId,
      params.taxYear,
    ]);
    return result.rows;
  } catch (err: unknown) {
    if (isUndefinedTableError(err)) return [];
    throw err;
  }
}

/** Carbon credit sales as normalised taxable income sources. */
export async function getCarbonCreditSales(params: {
  planterId: number;
  taxYear: number;
}): Promise<TaxableIncomeSource[]> {
  const rows = await getCarbonCreditSaleRows(params);

  return rows.map((row) => ({
    kind: 'carbon_credit_sale' as const,
    reference: row.sale_ref,
    occurredAt: toIsoString(row.sold_at),
    amount: row.gross_amount,
    currency: row.currency,
    assetCode: row.asset_code,
    memo: row.memo,
    creditsTons: row.credits_tons,
    pricePerTon: row.price_per_ton,
    projectRef: row.project_ref,
    verificationStandard: row.verification_standard,
    buyerRef: row.buyer_ref,
  }));
}

// ── Generated documents ───────────────────────────────────────────────────────

const UPSERT_DOCUMENT_SQL = `
  INSERT INTO tax_documents (
    planter_id,
    tax_year,
    form_type,
    status,
    gross_amount,
    record_count,
    payload,
    generated_by
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
  ON CONFLICT (planter_id, tax_year, form_type) DO UPDATE
    SET status        = EXCLUDED.status,
        gross_amount  = EXCLUDED.gross_amount,
        record_count  = EXCLUDED.record_count,
        payload       = EXCLUDED.payload,
        generated_by  = EXCLUDED.generated_by,
        generated_at  = NOW(),
        updated_at    = NOW()
  RETURNING *
`;

/**
 * Inserts or regenerates a tax document. Documents are keyed by
 * (planter, tax year, form type), so re-running generation is idempotent and
 * always reflects the current ledger data.
 */
export async function saveTaxDocument(
  params: SaveTaxDocumentParams
): Promise<TaxDocumentRow> {
  const pool = getPool();
  const result = await pool.query<TaxDocumentRow>(UPSERT_DOCUMENT_SQL, [
    params.planterId,
    params.taxYear,
    params.formType,
    params.status ?? 'generated',
    params.grossAmount.toFixed(2),
    params.recordCount,
    JSON.stringify(params.payload),
    params.generatedBy ?? null,
  ]);
  return result.rows[0];
}

/** Previously generated tax documents, newest first. */
export async function listTaxDocuments(params: {
  planterId: number;
  taxYear?: number;
}): Promise<TaxDocumentRow[]> {
  const pool = getPool();
  const result = await pool.query<TaxDocumentRow>(
    `SELECT *
       FROM tax_documents
      WHERE planter_id = $1
        AND ($2::int IS NULL OR tax_year = $2)
      ORDER BY tax_year DESC, form_type ASC`,
    [params.planterId, params.taxYear ?? null]
  );
  return result.rows;
}

// ── Internal utilities ────────────────────────────────────────────────────────

function toIsoString(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

/** True when pg reports `42P01 undefined_table` (migration not applied). */
export function isUndefinedTableError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === '42P01'
  );
}
