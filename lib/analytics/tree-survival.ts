import type { Pool } from 'pg';

export const ANALYTICS_DIMENSIONS = ['species', 'region', 'planter_team'] as const;
export type AnalyticsDimension = (typeof ANALYTICS_DIMENSIONS)[number];

export interface TreeAnalyticsFilters {
  from?: Date;
  to?: Date;
  species?: string;
  region?: string;
  planterTeam?: string;
}

export interface TreeAnalyticsRow {
  dimension: AnalyticsDimension;
  value: string;
  treeCount: number;
  plantedCount: number;
  verifiedCount: number;
  grownCount: number;
  diedCount: number;
  survivalRatePct: number;
  totalCostXlm: number;
  costPerTreeXlm: number;
  sponsorCount: number;
  retainedSponsorCount: number;
  sponsorRetentionRatePct: number;
}

export interface TreeAnalyticsReport {
  generatedAt: string;
  filters: { from: string | null; to: string | null };
  dimensions: Record<AnalyticsDimension, TreeAnalyticsRow[]>;
}

function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function parseDate(value: string | undefined, field: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} must be a valid ISO date`);
  return date;
}

export function parseTreeAnalyticsFilters(
  input: URLSearchParams | Record<string, unknown>
): TreeAnalyticsFilters {
  const get = (key: string): string | undefined =>
    input instanceof URLSearchParams
      ? (input.get(key) ?? undefined)
      : typeof input[key] === 'string'
        ? (input[key] as string)
        : undefined;
  const from = parseDate(get('from'), 'from');
  const to = parseDate(get('to'), 'to');
  if (from && to && from > to) throw new Error('from must be before or equal to to');
  return {
    from,
    to,
    species: get('species')?.trim() || undefined,
    region: get('region')?.trim() || undefined,
    planterTeam: get('planterTeam')?.trim() || undefined,
  };
}

/**
 * Produce the backend dashboard dataset from the canonical tree and event
 * tables. A tree is considered alive when its latest lifecycle status is not
 * `failed`; `completed` is the on-chain grown state in this schema.
 */
export async function getTreeAnalytics(
  pool: Pick<Pool, 'query'>,
  filters: TreeAnalyticsFilters = {}
): Promise<TreeAnalyticsReport> {
  const conditions: string[] = ['t.deleted_at IS NULL'];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    conditions.push(sql.replace('?', `$${params.length}`));
  };
  if (filters.from) add('t.created_at >= ?', filters.from);
  if (filters.to) add('t.created_at <= ?', filters.to);
  if (filters.species)
    add("COALESCE(sc.common_name, t.species_slug, 'Unknown') = ?", filters.species);
  if (filters.region) add('t.region = ?', filters.region);
  if (filters.planterTeam) add("COALESCE(pt.team_names, 'Unassigned') = ?", filters.planterTeam);

  const result = await pool.query<{
    species: string;
    region: string;
    planter_team: string;
    tree_count: string | number;
    planted_count: string | number;
    verified_count: string | number;
    grown_count: string | number;
    died_count: string | number;
    total_cost_xlm: string | number;
    sponsor_count: string | number;
    retained_sponsor_count: string | number;
  }>(
    `
    WITH team_names AS (
      SELECT ptm.planter_id, string_agg(pt.name, ', ' ORDER BY pt.name) AS team_names
      FROM planter_team_members ptm
      JOIN planter_teams pt ON pt.id = ptm.team_id
      GROUP BY ptm.planter_id
    ), tree_finance AS (
      SELECT se.tree_id,
             COALESCE(SUM(se.xlm_amount), 0)::numeric AS total_cost_xlm,
             COUNT(DISTINCT se.wallet)::int AS sponsor_count,
             COUNT(DISTINCT se.wallet) FILTER (
               WHERE EXISTS (
                 SELECT 1 FROM sponsorship_events repeat
                 WHERE repeat.wallet = se.wallet
                   AND repeat.funded_at > se.funded_at
               )
             )::int AS retained_sponsor_count
      FROM sponsorship_events se
      GROUP BY se.tree_id
    )
    SELECT
      COALESCE(sc.common_name, t.species_slug, 'Unknown') AS species,
      COALESCE(NULLIF(t.region, ''), 'Unknown') AS region,
      COALESCE(team_names.team_names, 'Unassigned') AS planter_team,
      COUNT(*)::int AS tree_count,
      COUNT(*) FILTER (WHERE t.status IN ('planted','verified','completed'))::int AS planted_count,
      COUNT(*) FILTER (WHERE t.status IN ('verified','completed'))::int AS verified_count,
      COUNT(*) FILTER (WHERE t.status = 'completed')::int AS grown_count,
      COUNT(*) FILTER (WHERE t.status = 'failed')::int AS died_count,
      COALESCE(SUM(tf.total_cost_xlm), 0)::numeric AS total_cost_xlm,
      COALESCE(SUM(tf.sponsor_count), 0)::int AS sponsor_count,
      COALESCE(SUM(tf.retained_sponsor_count), 0)::int AS retained_sponsor_count
    FROM trees t
    LEFT JOIN species_catalogue sc ON sc.slug = t.species_slug
    LEFT JOIN team_names ON team_names.planter_id = t.planter_id
    LEFT JOIN tree_finance tf ON tf.tree_id = t.id
    WHERE ${conditions.join(' AND ')}
    GROUP BY 1, 2, 3
    ORDER BY 1, 2, 3
  `,
    params
  );

  const empty = (): Record<AnalyticsDimension, TreeAnalyticsRow[]> => ({
    species: [],
    region: [],
    planter_team: [],
  });
  const dimensions = empty();
  for (const row of result.rows) {
    const treeCount = Number(row.tree_count);
    const diedCount = Number(row.died_count);
    const totalCost = Number(row.total_cost_xlm);
    const sponsorCount = Number(row.sponsor_count);
    const retained = Number(row.retained_sponsor_count);
    const base = (dimension: AnalyticsDimension, value: string): TreeAnalyticsRow => ({
      dimension,
      value,
      treeCount,
      plantedCount: Number(row.planted_count),
      verifiedCount: Number(row.verified_count),
      grownCount: Number(row.grown_count),
      diedCount,
      survivalRatePct: round(treeCount ? ((treeCount - diedCount) / treeCount) * 100 : 0),
      totalCostXlm: round(totalCost, 6),
      costPerTreeXlm: round(treeCount ? totalCost / treeCount : 0, 6),
      sponsorCount,
      retainedSponsorCount: retained,
      sponsorRetentionRatePct: round(sponsorCount ? (retained / sponsorCount) * 100 : 0),
    });
    dimensions.species.push(base('species', row.species));
    dimensions.region.push(base('region', row.region));
    dimensions.planter_team.push(base('planter_team', row.planter_team));
  }
  return {
    generatedAt: new Date().toISOString(),
    filters: { from: filters.from?.toISOString() ?? null, to: filters.to?.toISOString() ?? null },
    dimensions,
  };
}
