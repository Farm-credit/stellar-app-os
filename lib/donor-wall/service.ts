/**
 * Donor recognition wall data access (Issue #1656).
 *
 * - Trees funded per sponsor come from sponsorship_events (migration 011).
 * - Only sponsors with recognition_opt_in = TRUE are ever selected.
 * - The wall is a weekly snapshot: it is rebuilt when the stored snapshot is
 *   7+ days old (or missing). Opt-out and name/logo edits are re-checked on
 *   every read so an opted-out sponsor disappears immediately.
 */

import { getPool } from '@/lib/db/client';
import { getDonorTier, MIN_WALL_TREES, type DonorTierId } from './tiers';
import type { RecognitionSettingsInput } from './schema';

type Queryable = Pick<ReturnType<typeof getPool>, 'query'>;

export const SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const DONOR_WALL_LIMIT = 100;

export interface DonorWallEntry {
  wallet: string;
  name: string;
  logoUrl: string | null;
  totalTrees: number;
  tier: DonorTierId;
}

/** Shape served publicly — never includes the wallet address. */
export type PublicDonorWallEntry = Omit<DonorWallEntry, 'wallet'>;

export interface DonorWall {
  generatedAt: string;
  entries: PublicDonorWallEntry[];
}

export interface RecognitionSettings {
  recognitionOptIn: boolean;
  displayName: string;
  logoUrl: string;
}

export async function buildDonorWallEntries(
  pool: Queryable = getPool()
): Promise<DonorWallEntry[]> {
  const { rows } = await pool.query<{
    wallet: string;
    display_name: string;
    logo_url: string | null;
    total_trees: number;
  }>(
    `SELECT s.wallet,
            s.display_name,
            s.logo_url,
            SUM(e.trees_funded)::int AS total_trees
     FROM sponsor_recognition_settings s
     JOIN sponsorship_events e ON e.wallet = s.wallet
     WHERE s.recognition_opt_in = TRUE
       AND NULLIF(btrim(s.display_name), '') IS NOT NULL
     GROUP BY s.wallet, s.display_name, s.logo_url
     HAVING SUM(e.trees_funded) >= $1
     ORDER BY total_trees DESC, s.display_name ASC
     LIMIT $2`,
    [MIN_WALL_TREES, DONOR_WALL_LIMIT]
  );

  return rows.flatMap((row) => {
    const tier = getDonorTier(row.total_trees);
    return tier
      ? [
          {
            wallet: row.wallet,
            name: row.display_name,
            logoUrl: row.logo_url,
            totalTrees: row.total_trees,
            tier,
          },
        ]
      : [];
  });
}

/** Rebuild the snapshot and store it. Safe to call repeatedly. */
export async function refreshDonorWallSnapshot(
  pool: Queryable = getPool(),
  now: Date = new Date()
): Promise<{ generatedAt: Date; entries: DonorWallEntry[] }> {
  const entries = await buildDonorWallEntries(pool);
  await pool.query(
    `INSERT INTO donor_wall_snapshot (id, generated_at, entries)
     VALUES (1, $1, $2::jsonb)
     ON CONFLICT (id) DO UPDATE
       SET generated_at = EXCLUDED.generated_at, entries = EXCLUDED.entries`,
    [now.toISOString(), JSON.stringify(entries)]
  );
  return { generatedAt: now, entries };
}

export async function getDonorWall(
  pool: Queryable = getPool(),
  now: Date = new Date()
): Promise<DonorWall> {
  const stored = await pool.query<{ generated_at: Date; entries: DonorWallEntry[] }>(
    'SELECT generated_at, entries FROM donor_wall_snapshot WHERE id = 1'
  );

  const row = stored.rows[0];
  const isFresh = row && now.getTime() - new Date(row.generated_at).getTime() < SNAPSHOT_MAX_AGE_MS;
  const snapshot = isFresh
    ? { generatedAt: new Date(row.generated_at), entries: row.entries }
    : await refreshDonorWallSnapshot(pool, now);

  const entries = await applyCurrentRecognition(pool, snapshot.entries);
  return { generatedAt: snapshot.generatedAt.toISOString(), entries };
}

/**
 * Re-checks opt-in (and picks up the latest name/logo) so opting out takes
 * effect immediately, even though totals only refresh weekly.
 */
async function applyCurrentRecognition(
  pool: Queryable,
  entries: DonorWallEntry[]
): Promise<PublicDonorWallEntry[]> {
  if (entries.length === 0) return [];

  const { rows } = await pool.query<{
    wallet: string;
    display_name: string | null;
    logo_url: string | null;
  }>(
    `SELECT wallet, display_name, logo_url
     FROM sponsor_recognition_settings
     WHERE recognition_opt_in = TRUE AND wallet = ANY($1::text[])`,
    [entries.map((entry) => entry.wallet)]
  );
  const current = new Map(rows.map((row) => [row.wallet, row]));

  return entries.flatMap((entry) => {
    const settings = current.get(entry.wallet);
    const name = settings?.display_name?.trim();
    if (!settings || !name) return [];
    return [
      { name, logoUrl: settings.logo_url || null, totalTrees: entry.totalTrees, tier: entry.tier },
    ];
  });
}

export async function getRecognitionSettings(
  wallet: string,
  pool: Queryable = getPool()
): Promise<RecognitionSettings> {
  const { rows } = await pool.query<{
    recognition_opt_in: boolean;
    display_name: string | null;
    logo_url: string | null;
  }>(
    `SELECT recognition_opt_in, display_name, logo_url
     FROM sponsor_recognition_settings WHERE wallet = $1`,
    [wallet]
  );
  const row = rows[0];
  return {
    recognitionOptIn: row?.recognition_opt_in ?? false,
    displayName: row?.display_name ?? '',
    logoUrl: row?.logo_url ?? '',
  };
}

export async function saveRecognitionSettings(
  wallet: string,
  input: RecognitionSettingsInput,
  pool: Queryable = getPool()
): Promise<RecognitionSettings> {
  await pool.query(
    `INSERT INTO sponsor_recognition_settings (wallet, recognition_opt_in, display_name, logo_url, updated_at)
     VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), NOW())
     ON CONFLICT (wallet) DO UPDATE
       SET recognition_opt_in = EXCLUDED.recognition_opt_in,
           display_name = EXCLUDED.display_name,
           logo_url = EXCLUDED.logo_url,
           updated_at = NOW()`,
    [wallet, input.recognitionOptIn, input.displayName, input.logoUrl]
  );
  return getRecognitionSettings(wallet, pool);
}
