/**
 * lib/db/payouts.ts
 *
 * Data-access helpers for planter payout records.
 *
 * The primary source of truth is the `planter_payouts` table
 * (migration 009_create_planter_payouts.sql).  When that table is empty or
 * not yet migrated the query falls back to the
 * `v_planter_payouts_from_indexed` view so the endpoint keeps working on
 * existing deployments.
 *
 * All amounts are returned as JavaScript numbers (pg driver is configured to
 * parse BIGINT columns as numbers in lib/db/client.ts).
 */

import { getPool } from '@/lib/db/client';

// ── Row shape returned by the DB query ────────────────────────────────────────

export interface PlanterPayoutRow {
  id: number;
  planter_id: number;
  tx_hash: string;
  stellar_address: string;
  paid_at: Date;
  tax_year: number;
  asset_code: string;
  asset_issuer: string | null;
  amount: number;
  payout_type: string;
  memo: string | null;
  tree_id: number | null;
}

// ── Query parameters ──────────────────────────────────────────────────────────

export interface GetPayoutsParams {
  /** Internal planter id (from planters.id) */
  planterId: number;
  /** Calendar year to export — required for the tax CSV */
  taxYear: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns all payout rows for the given planter and year, ordered by
 * paid_at ascending (chronological — standard for a tax statement).
 *
 * Strategy:
 *  1. Query `planter_payouts` (primary table, post-migration).
 *  2. If the table doesn't exist yet (pg error code 42P01) fall back to the
 *     view `v_planter_payouts_from_indexed` which derives the same rows from
 *     `indexed_transactions`.
 */
export async function getPayoutsForPlanter(params: GetPayoutsParams): Promise<PlanterPayoutRow[]> {
  const pool = getPool();
  const { planterId, taxYear } = params;

  const primarySql = `
    SELECT
      id,
      planter_id,
      tx_hash,
      stellar_address,
      paid_at,
      tax_year,
      asset_code,
      asset_issuer,
      amount::float8          AS amount,
      payout_type,
      memo,
      tree_id
    FROM planter_payouts
    WHERE planter_id = $1
      AND tax_year   = $2
    ORDER BY paid_at ASC
  `;

  const fallbackSql = `
    SELECT
      0::bigint               AS id,
      planter_id,
      tx_hash,
      stellar_address,
      paid_at,
      tax_year,
      asset_code,
      asset_issuer,
      amount::float8          AS amount,
      payout_type,
      memo,
      tree_id
    FROM v_planter_payouts_from_indexed
    WHERE planter_id = $1
      AND tax_year   = $2
    ORDER BY paid_at ASC
  `;

  try {
    const result = await pool.query<PlanterPayoutRow>(primarySql, [planterId, taxYear]);
    return result.rows;
  } catch (err: unknown) {
    // 42P01 = undefined_table — migration not yet applied, use view fallback
    if (isUndefinedTableError(err)) {
      const result = await pool.query<PlanterPayoutRow>(fallbackSql, [planterId, taxYear]);
      return result.rows;
    }
    throw err;
  }
}

/**
 * Looks up the internal planter id by planterId string (numeric string as
 * used in the URL segment).  Returns null when the planter does not exist
 * or has been soft-deleted.
 */
export async function findActivePlanterById(
  planterId: number
): Promise<{ id: number; stellar_address: string } | null> {
  const pool = getPool();
  const result = await pool.query<{ id: number; stellar_address: string }>(
    `SELECT id, stellar_address
       FROM planters
      WHERE id = $1
        AND deleted_at IS NULL
      LIMIT 1`,
    [planterId]
  );
  return result.rows[0] ?? null;
}

// ── Internal utilities ────────────────────────────────────────────────────────

function isUndefinedTableError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === '42P01'
  );
}

/**
 * Serialises an array of payout rows to a RFC 4180-compliant CSV string.
 *
 * Columns are chosen to be useful for a tax authority:
 *   date, tx_hash, payout_type, asset_code, amount, stellar_address, memo, tree_id
 *
 * We keep the serialisation here (data layer) so the route stays thin and
 * tests can call this directly without spinning up Next.js.
 */
export function payoutsToCsv(rows: PlanterPayoutRow[]): string {
  const HEADERS = [
    'date',
    'tx_hash',
    'payout_type',
    'asset_code',
    'asset_issuer',
    'amount',
    'stellar_address',
    'memo',
    'tree_id',
  ] as const;

  const lines: string[] = [HEADERS.join(',')];

  for (const row of rows) {
    const values: (string | number | null | undefined)[] = [
      row.paid_at instanceof Date ? row.paid_at.toISOString() : String(row.paid_at),
      row.tx_hash,
      row.payout_type,
      row.asset_code,
      row.asset_issuer ?? '',
      row.amount,
      row.stellar_address,
      row.memo ?? '',
      row.tree_id ?? '',
    ];

    lines.push(values.map(csvEscape).join(','));
  }

  return lines.join('\r\n');
}

/** Wraps a value in double-quotes and escapes internal quotes per RFC 4180. */
function csvEscape(value: string | number | null | undefined): string {
  const str = value == null ? '' : String(value);
  // Wrap in quotes if the value contains a comma, newline, or double-quote
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
