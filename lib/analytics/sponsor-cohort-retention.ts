import type { Pool } from 'pg';
import type {
  CohortPeriodData,
  CohortRetentionReport,
  CohortRow,
  CohortSummary,
  RecordSponsorshipInput,
  SponsorRetentionSummary,
} from '@/lib/types/sponsor-cohort';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Derive the first-day-of-month date string for cohort bucketing. */
export function cohortMonth(date: Date): string {
  const d = new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/** Format a Date as "YYYY-MM". */
function fmtMonth(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === 'string' ? Number.parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
}

// ── Core service functions ──────────────────────────────────────────────────

/**
 * Record a new sponsorship event and upsert the sponsor cohort.
 * Called by the donation/staking flow whenever a sponsor funds a tree.
 */
export async function recordSponsorship(
  pool: Pool,
  input: RecordSponsorshipInput
): Promise<{ cohort_inserted: boolean; event_id: number }> {
  const cm = cohortMonth(new Date());
  const treesFunded = input.trees_funded ?? 1;
  const xlmAmount = input.xlm_amount ?? 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Upsert sponsor cohort — only sets first_sponsorship_at on first insert.
    const cohortResult = await client.query<{ inserted: boolean }>(
      `INSERT INTO sponsor_cohorts (wallet, first_sponsorship_at, cohort_month, total_sponsorships, total_trees, total_xlm)
       VALUES ($1, NOW(), $2::date, 1, $3, $4)
       ON CONFLICT (wallet) DO UPDATE SET
         total_sponsorships = sponsor_cohorts.total_sponsorships + 1,
         total_trees = sponsor_cohorts.total_trees + EXCLUDED.total_trees,
         total_xlm = sponsor_cohorts.total_xlm + EXCLUDED.total_xlm,
         updated_at = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [input.wallet, cm, treesFunded, xlmAmount.toString()]
    );

    // Insert the sponsorship event.
    const eventResult = await client.query<{ id: number }>(
      `INSERT INTO sponsorship_events (wallet, tree_id, trees_funded, xlm_amount, tx_hash, cohort_month, metadata)
       VALUES ($1, $2, $3, $4, $5, $6::date, $7)
       RETURNING id`,
      [
        input.wallet,
        input.tree_id ?? null,
        treesFunded,
        xlmAmount.toString(),
        input.tx_hash ?? null,
        cm,
        JSON.stringify(input.metadata ?? {}),
      ]
    );

    await client.query('COMMIT');

    return {
      cohort_inserted: cohortResult.rows[0]?.inserted ?? true,
      event_id: eventResult.rows[0]?.id ?? 0,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Compute the full cohort retention matrix.
 * Returns a report suitable for rendering a retention heatmap.
 */
export async function getCohortRetentionReport(
  pool: Pool,
  opts: { from?: string; to?: string; max_periods?: number } = {}
): Promise<CohortRetentionReport> {
  const maxPeriods = opts.max_periods ?? 12;

  // Fetch raw retention rows.
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (opts.from) {
    conditions.push(`cohort_month >= $${paramIdx++}::date`);
    params.push(`${opts.from}-01`);
  }
  if (opts.to) {
    conditions.push(`cohort_month <= $${paramIdx++}::date`);
    params.push(`${opts.to}-01`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await pool.query<{
    cohort_month: Date;
    period_month: Date;
    period_offset: number;
    cohort_size: number;
    retained_count: number;
    retention_pct: string;
    total_xlm: string;
  }>(
    `SELECT cohort_month, period_month, period_offset, cohort_size,
            retained_count, retention_pct, total_xlm
     FROM sponsor_cohort_retention
     ${whereClause}
     ORDER BY cohort_month DESC, period_offset ASC`,
    params
  );

  // Group into cohort rows.
  const cohortMap = new Map<string, { cohort_size: number; periods: CohortPeriodData[] }>();

  for (const row of result.rows) {
    if (row.period_offset > maxPeriods) continue;
    const key = fmtMonth(row.cohort_month);
    if (!cohortMap.has(key)) {
      cohortMap.set(key, { cohort_size: row.cohort_size, periods: [] });
    }
    const entry = cohortMap.get(key);
    if (entry) {
      entry.periods.push({
        period_offset: row.period_offset,
        period_month: fmtMonth(row.period_month),
        retained_count: row.retained_count,
        retention_pct: toNum(row.retention_pct),
        total_xlm: toNum(row.total_xlm),
      });
    }
  }

  const cohorts: CohortRow[] = [];
  for (const [cohort_month, data] of cohortMap) {
    cohorts.push({ cohort_month, cohort_size: data.cohort_size, periods: data.periods });
  }

  // Compute summary.
  const summary = await computeCohortSummary(pool);

  return {
    generated_at: new Date().toISOString(),
    cohorts,
    summary,
  };
}

/** Compute high-level cohort summary statistics. */
async function computeCohortSummary(pool: Pool): Promise<CohortSummary> {
  const statsResult = await pool.query<{
    total_cohorts: number;
    latest_cohort_month: Date | null;
    total_sponsors: number;
    total_sponsorships: number;
  }>(
    `SELECT
       COUNT(DISTINCT cohort_month) AS total_cohorts,
       MAX(cohort_month) AS latest_cohort_month,
       COUNT(*) AS total_sponsors,
       COALESCE(SUM(total_sponsorships), 0) AS total_sponsorships
     FROM sponsor_cohorts`
  );

  const stats = statsResult.rows[0];

  // Average M1 retention (period_offset = 1).
  const m1Result = await pool.query<{ avg_retention: string | null }>(
    `SELECT AVG(retention_pct) AS avg_retention
     FROM sponsor_cohort_retention
     WHERE period_offset = 1`
  );

  // Average M3 retention (period_offset = 3).
  const m3Result = await pool.query<{ avg_retention: string | null }>(
    `SELECT AVG(retention_pct) AS avg_retention
     FROM sponsor_cohort_retention
     WHERE period_offset = 3`
  );

  return {
    total_cohorts: stats?.total_cohorts ?? 0,
    latest_cohort_month: stats?.latest_cohort_month ? fmtMonth(stats.latest_cohort_month) : '',
    average_m1_retention: m1Result.rows[0]?.avg_retention
      ? toNum(m1Result.rows[0].avg_retention)
      : null,
    average_m3_retention: m3Result.rows[0]?.avg_retention
      ? toNum(m3Result.rows[0].avg_retention)
      : null,
    total_sponsors_all_time: stats?.total_sponsors ?? 0,
    total_sponsorships_all_time: toNum(stats?.total_sponsorships),
  };
}

/**
 * Get a single sponsor's retention summary.
 */
export async function getSponsorRetentionSummary(
  pool: Pick<Pool, 'query'>,
  wallet: string
): Promise<SponsorRetentionSummary | null> {
  const result = await pool.query<{
    wallet: string;
    cohort_month: Date;
    total_sponsorships: number;
    total_trees: number;
    total_xlm: string;
    last_sponsorship_at: Date | null;
  }>(
    `SELECT c.wallet, c.cohort_month, c.total_sponsorships, c.total_trees, c.total_xlm,
            (SELECT MAX(funded_at) FROM sponsorship_events WHERE wallet = c.wallet) AS last_sponsorship_at
     FROM sponsor_cohorts c
     WHERE c.wallet = $1`,
    [wallet]
  );

  const row = result.rows[0];
  if (!row) return null;

  const lastAt = row.last_sponsorship_at ? new Date(row.last_sponsorship_at) : null;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Count distinct months with at least one sponsorship.
  const monthsResult = await pool.query<{ months_active: string }>(
    `SELECT COUNT(DISTINCT DATE_TRUNC('month', funded_at)) AS months_active
     FROM sponsorship_events
     WHERE wallet = $1`,
    [wallet]
  );

  return {
    wallet: row.wallet,
    cohort_month: fmtMonth(row.cohort_month),
    total_sponsorships: row.total_sponsorships,
    total_trees: row.total_trees,
    total_xlm: toNum(row.total_xlm),
    months_active: Number(monthsResult.rows[0]?.months_active ?? 0),
    last_sponsorship_at: lastAt?.toISOString() ?? '',
    is_currently_active: lastAt ? lastAt > thirtyDaysAgo : false,
  };
}

/**
 * Refresh the sponsor_cohort_retention materialised view.
 *
 * This should be run monthly (via cron) or on-demand for accurate retention data.
 * It scans all sponsorship_events, computes cohort sizes, and determines which
 * sponsors were active in each subsequent month.
 */
export async function refreshCohortRetention(
  pool: Pool
): Promise<{ cohorts_processed: number; rows_upserted: number }> {
  const client = await pool.connect();
  let rowsUpserted = 0;

  try {
    await client.query('BEGIN');

    // Step 1: Build a CTE that computes, for each (cohort_month, period_month),
    // how many cohort sponsors were active in that period_month.
    const result = await client.query<{ cohorts_processed: number }>(
      `WITH cohort_sizes AS (
         SELECT cohort_month, COUNT(*) AS cohort_size
         FROM sponsor_cohorts
         GROUP BY cohort_month
       ),
       cohort_activity AS (
         SELECT DISTINCT
           se.cohort_month,
           DATE_TRUNC('month', se.funded_at)::date AS period_month,
           se.wallet
         FROM sponsorship_events se
       ),
       cohort_period_counts AS (
         SELECT
           ca.cohort_month,
           ca.period_month,
           cs.cohort_size,
           COUNT(DISTINCT ca.wallet) AS retained_count
         FROM cohort_activity ca
         JOIN cohort_sizes cs ON cs.cohort_month = ca.cohort_month
         GROUP BY ca.cohort_month, ca.period_month, cs.cohort_size
       ),
       xlm_by_period AS (
         SELECT
           se.cohort_month,
           DATE_TRUNC('month', se.funded_at)::date AS period_month,
           SUM(se.xlm_amount) AS total_xlm
         FROM sponsorship_events se
         GROUP BY se.cohort_month, DATE_TRUNC('month', se.funded_at)::date
       )
       INSERT INTO sponsor_cohort_retention
         (cohort_month, period_month, period_offset, cohort_size, retained_count, retention_pct, total_xlm)
       SELECT
         cpc.cohort_month,
         cpc.period_month,
         EXTRACT(YEAR FROM age(cpc.period_month, cpc.cohort_month)) * 12
           + EXTRACT(MONTH FROM age(cpc.period_month, cpc.cohort_month))::int AS period_offset,
         cpc.cohort_size,
         cpc.retained_count,
         ROUND(cpc.retained_count::numeric / NULLIF(cpc.cohort_size, 0) * 100, 2) AS retention_pct,
         COALESCE(xp.total_xlm, 0) AS total_xlm
       FROM cohort_period_counts cpc
       LEFT JOIN xlm_by_period xp ON xp.cohort_month = cpc.cohort_month AND xp.period_month = cpc.period_month
       ON CONFLICT (cohort_month, period_month) DO UPDATE SET
         period_offset = EXCLUDED.period_offset,
         cohort_size = EXCLUDED.cohort_size,
         retained_count = EXCLUDED.retained_count,
         retention_pct = EXCLUDED.retention_pct,
         total_xlm = EXCLUDED.total_xlm,
         generated_at = NOW()
       RETURNING 1`
    );

    rowsUpserted = result.rowCount ?? 0;

    const countResult = await client.query<{ count: string }>(
      'SELECT COUNT(DISTINCT cohort_month) AS count FROM sponsor_cohort_retention'
    );

    await client.query('COMMIT');

    return {
      cohorts_processed: Number(countResult.rows[0]?.count ?? 0),
      rows_upserted: rowsUpserted,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
