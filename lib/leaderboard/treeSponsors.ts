import { getPool } from '@/lib/db/client';
import { DEFAULT_LEADERBOARD_PREFERENCES } from './treeSponsorsSchema';
import type {
  LeaderboardPeriod,
  LeaderboardPreferences,
  SponsorType,
  TreeSponsorSnapshot,
} from './treeSponsorsSchema';

/** The consent join is evaluated on every request, including after an opt-out. */
export async function getTreeSponsorLeaderboard(
  period: LeaderboardPeriod,
  sponsorType: SponsorType,
  now = new Date()
): Promise<TreeSponsorSnapshot> {
  const start =
    period === 'monthly'
      ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
      : null;
  const result = await getPool().query<{ rank: string; display_name: string; trees: string }>(
    `
    WITH totals AS (
      SELECT p.wallet, p.display_name, SUM(e.trees_funded) AS trees
      FROM sponsor_leaderboard_preferences p
      JOIN sponsorship_events e ON e.wallet = p.wallet
      WHERE p.opted_in = TRUE AND p.sponsor_type = $1
        AND e.trees_funded > 0 AND e.funded_at <= $2::timestamptz
        AND ($3::timestamptz IS NULL OR e.funded_at >= $3::timestamptz)
      GROUP BY p.wallet, p.display_name
    )
    SELECT RANK() OVER (ORDER BY trees DESC) AS rank, display_name, trees
    FROM totals ORDER BY trees DESC, display_name ASC, wallet ASC LIMIT 100
  `,
    [sponsorType, now.toISOString(), start]
  );
  return {
    entries: result.rows.map((row) => ({
      rank: Number(row.rank),
      displayName: row.display_name,
      trees: Number(row.trees),
    })),
    updatedAt: now.toISOString(),
    period,
    sponsorType,
  };
}

export async function getLeaderboardPreferences(wallet: string): Promise<LeaderboardPreferences> {
  const result = await getPool().query<LeaderboardPreferences>(
    `
    SELECT opted_in AS "optedIn", display_name AS "displayName", sponsor_type AS "sponsorType"
    FROM sponsor_leaderboard_preferences WHERE wallet = $1
  `,
    [wallet]
  );
  return result.rows[0] ?? { ...DEFAULT_LEADERBOARD_PREFERENCES };
}

export async function saveLeaderboardPreferences(
  wallet: string,
  preferences: LeaderboardPreferences
): Promise<void> {
  await getPool().query(
    `
    INSERT INTO sponsor_leaderboard_preferences (wallet, opted_in, display_name, sponsor_type)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (wallet) DO UPDATE SET opted_in = EXCLUDED.opted_in,
      display_name = EXCLUDED.display_name, sponsor_type = EXCLUDED.sponsor_type, updated_at = NOW()
  `,
    [wallet, preferences.optedIn, preferences.displayName, preferences.sponsorType]
  );
}
