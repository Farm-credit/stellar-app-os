/**
 * CSV Export Service
 *
 * Generates downloadable CSV reports for trees, sponsors, and planters.
 * Supports custom date-range and field-level filters so sponsors and admins
 * can slice the data they need without touching the database directly.
 *
 * Closes #1116
 */

import { type Pool } from 'pg';

// ---------------------------------------------------------------------------
// Filter type shared by all export functions
// ---------------------------------------------------------------------------

export interface ExportFilters {
  /** ISO-8601 date string, inclusive lower bound on record creation/planting */
  startDate?: string;
  /** ISO-8601 date string, inclusive upper bound on record creation/planting */
  endDate?: string;
  /** Entity-specific status filter (e.g. 'planted', 'verified', 'completed') */
  status?: string;
  /** Filter trees/planters to a specific project identifier */
  projectId?: string;
  /** Cap the number of rows returned. Defaults to 10 000 to avoid runaway exports. */
  limit?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Escape a value so it is safe to embed in a CSV cell.
 * Wraps the value in double-quotes and escapes any double-quotes inside it.
 */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Convert an array of objects to a CSV string (header row + data rows). */
function rowsToCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const headerLine = headers.map(csvCell).join(',');
  const dataLines = rows.map((row) => headers.map((h) => csvCell(row[h])).join(','));
  return [headerLine, ...dataLines].join('\n');
}

/** Build a SQL WHERE clause fragment and params array for common date/status filters. */
function buildWhereClause(
  filters: ExportFilters,
  dateColumn: string,
  statusColumn?: string
): { where: string; params: (string | number)[] } {
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  let idx = 1;

  if (filters.startDate) {
    conditions.push(`${dateColumn} >= $${idx++}`);
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    conditions.push(`${dateColumn} <= $${idx++}`);
    params.push(filters.endDate);
  }
  if (filters.status && statusColumn) {
    conditions.push(`${statusColumn} = $${idx++}`);
    params.push(filters.status);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { where, params };
}

// ---------------------------------------------------------------------------
// Trees CSV
// ---------------------------------------------------------------------------

export interface TreeCsvRow {
  id: string;
  tree_ref: string;
  species: string;
  region: string;
  country_code: string;
  lat: string;
  lng: string;
  status: string;
  planter_name: string;
  planter_id: string;
  planted_at: string;
  verified_at: string;
  completed_at: string;
  created_at: string;
}

const TREE_HEADERS: (keyof TreeCsvRow)[] = [
  'id',
  'tree_ref',
  'species',
  'region',
  'country_code',
  'lat',
  'lng',
  'status',
  'planter_id',
  'planter_name',
  'planted_at',
  'verified_at',
  'completed_at',
  'created_at',
];

/**
 * Query trees with optional date/status/project filters and return a CSV string.
 */
export async function generateTreesCsv(pool: Pool, filters: ExportFilters = {}): Promise<string> {
  const limit = Math.min(filters.limit ?? 10_000, 50_000);
  const { where, params } = buildWhereClause(filters, 't.created_at', 't.status');

  // Project filter appended independently so the $idx numbering stays consistent.
  let projectFilter = '';
  if (filters.projectId) {
    params.push(filters.projectId);
    projectFilter = `AND t.contract_address = $${params.length}`;
  }

  params.push(limit);
  const limitIdx = params.length;

  const sql = `
    SELECT
      t.id,
      t.tree_ref,
      COALESCE(t.species_slug, '') AS species,
      t.region,
      t.country_code,
      t.lat,
      t.lng,
      t.status,
      COALESCE(p.id::text, '') AS planter_id,
      COALESCE(p.full_name, '') AS planter_name,
      t.planted_at,
      t.verified_at,
      t.completed_at,
      t.created_at
    FROM trees t
    LEFT JOIN planters p ON p.id = t.planter_id
    ${where}
    ${projectFilter}
    ORDER BY t.created_at DESC
    LIMIT $${limitIdx}
  `;

  const result = await pool.query<TreeCsvRow>(sql, params);
  return rowsToCsv(TREE_HEADERS as string[], result.rows as unknown as Record<string, unknown>[]);
}

// ---------------------------------------------------------------------------
// Sponsors CSV
// ---------------------------------------------------------------------------

export interface SponsorCsvRow {
  id: string;
  name: string;
  email: string;
  total_trees: string;
  total_amount_usd: string;
  first_sponsored_at: string;
  last_sponsored_at: string;
  created_at: string;
}

const SPONSOR_HEADERS: (keyof SponsorCsvRow)[] = [
  'id',
  'name',
  'email',
  'total_trees',
  'total_amount_usd',
  'first_sponsored_at',
  'last_sponsored_at',
  'created_at',
];

/**
 * Query sponsor aggregates with optional date filter and return a CSV string.
 * NOTE: This query works against a `sponsors` view / table. If the underlying
 * schema uses a different table name adjust accordingly.
 */
export async function generateSponsorsCsv(
  pool: Pool,
  filters: ExportFilters = {}
): Promise<string> {
  const limit = Math.min(filters.limit ?? 10_000, 50_000);
  const { where, params } = buildWhereClause(filters, 's.created_at');

  params.push(limit);
  const limitIdx = params.length;

  const sql = `
    SELECT
      s.id,
      COALESCE(s.full_name, s.stellar_address) AS name,
      COALESCE(s.email, '') AS email,
      COUNT(t.id)::text AS total_trees,
      COALESCE(SUM(t.funding_amount_usd), 0)::text AS total_amount_usd,
      MIN(t.created_at) AS first_sponsored_at,
      MAX(t.created_at) AS last_sponsored_at,
      s.created_at
    FROM sponsors s
    LEFT JOIN trees t ON t.sponsor_id = s.id AND t.deleted_at IS NULL
    ${where}
    GROUP BY s.id, s.full_name, s.stellar_address, s.email, s.created_at
    ORDER BY s.created_at DESC
    LIMIT $${limitIdx}
  `;

  const result = await pool.query<SponsorCsvRow>(sql, params);
  return rowsToCsv(
    SPONSOR_HEADERS as string[],
    result.rows as unknown as Record<string, unknown>[]
  );
}

// ---------------------------------------------------------------------------
// Planters CSV
// ---------------------------------------------------------------------------

export interface PlanterCsvRow {
  id: string;
  full_name: string;
  country_code: string;
  region: string;
  kyc_status: string;
  total_trees_planted: string;
  verified_count: string;
  created_at: string;
}

const PLANTER_HEADERS: (keyof PlanterCsvRow)[] = [
  'id',
  'full_name',
  'country_code',
  'region',
  'kyc_status',
  'total_trees_planted',
  'verified_count',
  'created_at',
];

/**
 * Query planters with optional date/status filter and return a CSV string.
 */
export async function generatePlantersCsv(
  pool: Pool,
  filters: ExportFilters = {}
): Promise<string> {
  const limit = Math.min(filters.limit ?? 10_000, 50_000);
  const { where, params } = buildWhereClause(filters, 'p.created_at', 'p.kyc_status');

  params.push(limit);
  const limitIdx = params.length;

  const sql = `
    SELECT
      p.id,
      p.full_name,
      p.country_code,
      p.region,
      p.kyc_status,
      COUNT(t.id)::text AS total_trees_planted,
      COUNT(t.id) FILTER (WHERE t.status = 'verified')::text AS verified_count,
      p.created_at
    FROM planters p
    LEFT JOIN trees t ON t.planter_id = p.id AND t.deleted_at IS NULL
    ${where}
    GROUP BY p.id, p.full_name, p.country_code, p.region, p.kyc_status, p.created_at
    ORDER BY p.created_at DESC
    LIMIT $${limitIdx}
  `;

  const result = await pool.query<PlanterCsvRow>(sql, params);
  return rowsToCsv(
    PLANTER_HEADERS as string[],
    result.rows as unknown as Record<string, unknown>[]
  );
}
