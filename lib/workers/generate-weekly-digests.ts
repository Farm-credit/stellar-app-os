import { getPool } from '@/lib/db/client';
import logger from '@/lib/logger';

export interface DigestGenerationSummary {
  generated: number;
  skipped: number;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Generate one weekly digest job per sponsor. The stable UUID derived from the
 * normalized email makes the existing per-user/week unique index effective
 * even though this repository stores sponsor identity as an email address.
 */
export async function generateWeeklyDigests(
  pool = getPool(),
  periodEnd = new Date()
): Promise<DigestGenerationSummary> {
  const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
  const { rows } = await pool.query<{
    email: string;
    name: string;
    tree_count: number;
    new_trees: number;
    total_co2_kg: number;
    new_updates: number;
    top_species: string | null;
    photo_urls: string[] | null;
    regions: string[] | null;
  }>(
    `SELECT lower(trim(w.sponsor_email)) AS email,
            max(NULLIF(trim(w.sponsor_name), '')) AS name,
            count(DISTINCT w.tree_id)::int AS tree_count,
            count(DISTINCT w.tree_id) FILTER (WHERE t.created_at >= $1 AND t.created_at < $2)::int AS new_trees,
            COALESCE((SELECT sum(COALESCE(sc2.co2_kg_per_year, 48))
                      FROM planting_waitlist w2
                      LEFT JOIN trees t2 ON t2.tree_ref = w2.tree_id AND t2.deleted_at IS NULL
                      LEFT JOIN species_catalogue sc2 ON sc2.slug = COALESCE(t2.species_slug, w2.species)
                      WHERE lower(trim(w2.sponsor_email)) = lower(trim(w.sponsor_email))
                        AND w2.status <> 'cancelled'), 0)::real AS total_co2_kg,
            count(DISTINCT pu.id) FILTER (WHERE pu.created_at >= $1 AND pu.created_at < $2)::int AS new_updates,
            mode() WITHIN GROUP (ORDER BY COALESCE(sc.common_name, w.species)) AS top_species,
            COALESCE(array_agg(DISTINCT pu.media_url) FILTER (WHERE pu.media_url IS NOT NULL AND pu.created_at >= $1 AND pu.created_at < $2), '{}') AS photo_urls,
            COALESCE(array_agg(DISTINCT w.region) FILTER (WHERE w.region IS NOT NULL), '{}') AS regions
     FROM planting_waitlist w
     LEFT JOIN trees t ON t.tree_ref = w.tree_id AND t.deleted_at IS NULL
     LEFT JOIN species_catalogue sc ON sc.slug = COALESCE(t.species_slug, w.species)
     LEFT JOIN progress_updates pu ON pu.tree_id = t.id
     WHERE w.sponsor_email IS NOT NULL AND trim(w.sponsor_email) <> ''
       AND w.status <> 'cancelled'
     GROUP BY lower(trim(w.sponsor_email))`,
    [periodStart, periodEnd]
  );

  let generated = 0;
  for (const row of rows) {
    const result = await pool.query(
      `INSERT INTO email_digests
        (user_id, user_email, digest_type, tree_count, total_co2_kg, new_updates, top_species, photo_urls, community_highlights, generated_at)
       SELECT md5($1)::uuid, $1, 'weekly', $2, $3, $4, COALESCE($5, 'Unknown'), $6::jsonb, $7::jsonb, $8
       WHERE NOT EXISTS (
         SELECT 1 FROM email_digests
         WHERE user_id = md5($1)::uuid AND digest_type = 'weekly'
           AND generated_at >= date_trunc('week', $8::timestamptz)
           AND generated_at < date_trunc('week', $8::timestamptz) + interval '1 week'
           AND status IN ('pending', 'processing', 'sent')
       )`,
      [
        row.email,
        row.tree_count,
        Number(row.total_co2_kg ?? 0),
        row.new_updates,
        row.top_species,
        JSON.stringify((row.photo_urls ?? []).filter(Boolean).slice(0, 8)),
        JSON.stringify(
          (row.regions ?? [])
            .filter(Boolean)
            .slice(0, 5)
            .map((region) => `Community update from ${region}`)
        ),
        periodEnd,
      ]
    );
    generated += result.rowCount ?? 0;
  }
  const summary = { generated, skipped: rows.length - generated, periodStart, periodEnd };
  logger.info('[email-digest-generator] weekly generation complete', summary);
  return summary;
}

if (process.argv.includes('--once')) {
  generateWeeklyDigests()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error('[email-digest-generator] failed', error);
      process.exit(1);
    });
}
