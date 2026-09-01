import type { Pool } from 'pg';
import {
  type ChallengeDifficulty,
  type ChallengeStatus,
  type ChallengeType,
  type DailyChallengeCard,
  type DailyChallengesResponse,
  type ChallengeHistoryEntry,
  type TrackProgressInput,
  type StreakSummary,
} from '@/lib/types/daily-challenge';

// ── Helpers ─────────────────────────────────────────────────────────────────

function toNum(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === 'string' ? Number.parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(d: Date | string): string {
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

// ── Challenge assignment ────────────────────────────────────────────────────

/**
 * Get today's challenges for a sponsor.
 * Auto-assigns challenges if none exist for today.
 */
export async function getDailyChallenges(
  pool: Pick<Pool, 'query'>,
  wallet: string
): Promise<DailyChallengesResponse> {
  const date = todayStr();

  // Ensure sponsor has an assignment for today.
  const existingResult = await pool.query<{ id: number }>(
    'SELECT id FROM sponsor_daily_challenges WHERE wallet = $1 AND assigned_date = $2 LIMIT 1',
    [wallet, date]
  );

  if (existingResult.rows.length === 0) {
    await assignDailyChallenges(pool, wallet, date);
  }

  // Fetch today's challenges with challenge details.
  const challengesResult = await pool.query<{
    id: number;
    slug: string;
    title: string;
    description: string;
    challenge_type: ChallengeType;
    difficulty: ChallengeDifficulty;
    target_value: number;
    reward_xlm: string;
    reward_nft: boolean;
    species_slug: string | null;
    region: string | null;
    progress: number;
    target: number;
    status: ChallengeStatus;
  }>(
    `SELECT dc.id AS challenge_id, dc.slug, dc.title, dc.description,
            dc.challenge_type, dc.difficulty, dc.target_value, dc.reward_xlm,
            dc.reward_nft, dc.species_slug, dc.region,
            sdc.progress, sdc.target, sdc.status
     FROM sponsor_daily_challenges sdc
     JOIN daily_challenges dc ON dc.id = sdc.challenge_id
     WHERE sdc.wallet = $1 AND sdc.assigned_date = $2
     ORDER BY dc.difficulty ASC, dc.id ASC`,
    [wallet, date]
  );

  // Fetch streak info.
  const streak = await getStreak(pool, wallet);

  // Compute effective rewards with streak multiplier.
  const challenges: DailyChallengeCard[] = challengesResult.rows.map((row) => {
    const baseReward = toNum(row.reward_xlm);
    const effectiveReward = baseReward * streak.streak_multiplier;
    const progressPct =
      row.target > 0 ? Math.min(100, Math.round((row.progress / row.target) * 100)) : 0;

    return {
      id: row.challenge_id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      challenge_type: row.challenge_type,
      difficulty: row.difficulty,
      target: row.target,
      progress: row.progress,
      progress_pct: progressPct,
      status: row.status,
      reward_xlm: baseReward,
      reward_nft: row.reward_nft,
      streak_multiplier: streak.streak_multiplier,
      effective_reward: effectiveReward,
      species_slug: row.species_slug,
      region: row.region,
    };
  });

  // Count completed and earned XLM today.
  const todayCompleted = challenges.filter(
    (c) => c.status === 'completed' || c.status === 'claimed'
  ).length;
  const todayEarned = challenges
    .filter((c) => c.status === 'completed' || c.status === 'claimed')
    .reduce((sum, c) => sum + c.effective_reward, 0);

  // Fetch total unclaimed XLM.
  const unclaimedResult = await pool.query<{ total: string }>(
    `SELECT COALESCE(SUM(reward_amount), 0) AS total
     FROM challenge_rewards
     WHERE wallet = $1 AND claimed = FALSE`,
    [wallet]
  );

  return {
    date,
    challenges,
    streak,
    today_completed: todayCompleted,
    today_total: challenges.length,
    today_earned_xlm: todayEarned,
    total_unclaimed_xlm: toNum(unclaimedResult.rows[0]?.total),
  };
}

/**
 * Assign daily challenges to a sponsor for a given date.
 * Selects 3 challenges of varied difficulty from the active pool.
 */
async function assignDailyChallenges(
  pool: Pick<Pool, 'query'>,
  wallet: string,
  date: string
): Promise<void> {
  // Select active challenges appropriate for today.
  // Pick one easy, one medium, one hard (if available).
  const difficulties: ChallengeDifficulty[] = ['easy', 'medium', 'hard'];

  for (const difficulty of difficulties) {
    // Pick a random challenge of this difficulty that's active and not already assigned today.
    const result = await pool.query<{ id: number }>(
      `SELECT dc.id
       FROM daily_challenges dc
       WHERE dc.active = TRUE
         AND dc.difficulty = $1
         AND (dc.start_date IS NULL OR dc.start_date <= $3)
         AND (dc.end_date IS NULL OR dc.end_date >= $3)
         AND dc.id NOT IN (
           SELECT challenge_id FROM sponsor_daily_challenges
           WHERE wallet = $2 AND assigned_date = $3
         )
       ORDER BY RANDOM()
       LIMIT 1`,
      [difficulty, wallet, date]
    );

    if (result.rows[0]) {
      await pool.query(
        `INSERT INTO sponsor_daily_challenges (wallet, challenge_id, assigned_date, target)
         VALUES ($1, $2, $3, (SELECT target_value FROM daily_challenges WHERE id = $2))
         ON CONFLICT (wallet, challenge_id, assigned_date) DO NOTHING`,
        [wallet, result.rows[0].id, date]
      );
    }
  }
}

// ── Progress tracking ───────────────────────────────────────────────────────

/**
 * Track progress on a daily challenge.
 * Called by donation/staking flows when an event occurs that could advance a challenge.
 */
export async function trackChallengeProgress(
  pool: Pick<Pool, 'query'>,
  input: TrackProgressInput
): Promise<{ challenges_advanced: number; newly_completed: number }> {
  const date = todayStr();
  let challengesAdvanced = 0;
  let newlyCompleted = 0;

  // Find matching in-progress or assigned challenges for today.
  const result = await pool.query<{
    sdc_id: number;
    challenge_id: number;
    challenge_type: ChallengeType;
    species_slug: string | null;
    region: string | null;
    progress: number;
    target: number;
    status: ChallengeStatus;
  }>(
    `SELECT sdc.id AS sdc_id, sdc.challenge_id, dc.challenge_type,
            dc.species_slug, dc.region,
            sdc.progress, sdc.target, sdc.status
     FROM sponsor_daily_challenges sdc
     JOIN daily_challenges dc ON dc.id = sdc.challenge_id
     WHERE sdc.wallet = $1
       AND sdc.assigned_date = $2
       AND sdc.status IN ('assigned', 'in_progress')`,
    [wallet, date]
  );

  for (const row of result.rows) {
    // Check if this challenge matches the event type.
    if (row.challenge_type !== input.challenge_type) continue;

    // Check species filter if applicable.
    if (row.species_slug && input.species_slug && row.species_slug !== input.species_slug) continue;
    // Skip species challenges if no species provided.
    if (row.species_slug && !input.species_slug) continue;

    // Check region filter if applicable.
    if (row.region && input.region && row.region !== input.region) continue;
    if (row.region && !input.region) continue;

    // Advance progress.
    const newProgress = row.progress + input.increment;
    const clampedProgress = Math.min(newProgress, row.target);
    const newStatus: ChallengeStatus = clampedProgress >= row.target ? 'completed' : 'in_progress';

    await pool.query(
      `UPDATE sponsor_daily_challenges
       SET progress = $1, status = $2, completed_at = CASE WHEN $2 = 'completed' THEN NOW() ELSE completed_at END
       WHERE id = $3`,
      [clampedProgress, newStatus, row.sdc_id]
    );

    challengesAdvanced++;
    if (newStatus === 'completed') {
      newlyCompleted++;
      // Create reward record.
      await createReward(pool, row.sdc_id, row.challenge_id);
    }
  }

  // Update streak if any progress was made.
  if (challengesAdvanced > 0) {
    await updateStreak(pool, wallet);
  }

  return { challenges_advanced: challengesAdvanced, newly_completed: newlyCompleted };
}

// ── Rewards ─────────────────────────────────────────────────────────────────

/** Create a reward record for a completed challenge. */
async function createReward(
  pool: Pick<Pool, 'query'>,
  sponsorChallengeId: number,
  challengeId: number
): Promise<void> {
  const challengeResult = await pool.query<{
    reward_xlm: string;
    reward_nft: boolean;
    badge_id: string | null;
  }>('SELECT reward_xlm, reward_nft, badge_id FROM daily_challenges WHERE id = $1', [challengeId]);

  const challenge = challengeResult.rows[0];
  if (!challenge) return;

  // Fetch the wallet and streak multiplier.
  const sdcResult = await pool.query<{ wallet: string }>(
    'SELECT wallet FROM sponsor_daily_challenges WHERE id = $1',
    [sponsorChallengeId]
  );
  const wallet = sdcResult.rows[0]?.wallet;
  if (!wallet) return;

  const streak = await getStreak(pool, wallet);
  const baseReward = toNum(challenge.reward_xlm);
  const effectiveReward = baseReward * streak.streak_multiplier;

  // Insert XLM reward.
  if (effectiveReward > 0) {
    await pool.query(
      `INSERT INTO challenge_rewards (wallet, challenge_id, sponsor_challenge_id, reward_type, reward_amount, reward_description)
       VALUES ($1, $2, $3, 'xlm', $4, $5)`,
      [
        wallet,
        challengeId,
        sponsorChallengeId,
        effectiveReward.toString(),
        `${effectiveReward.toFixed(2)} XLM daily challenge reward (streak ×${streak.streak_multiplier.toFixed(2)})`,
      ]
    );
  }

  // Insert badge reward if applicable.
  if (challenge.badge_id) {
    await pool.query(
      `INSERT INTO challenge_rewards (wallet, challenge_id, sponsor_challenge_id, reward_type, reward_amount, reward_description)
       VALUES ($1, $2, $3, 'badge', 0, $4)`,
      [wallet, challengeId, sponsorChallengeId, `Badge: ${challenge.badge_id}`]
    );
  }
}

/** Claim all unclaimed rewards for a sponsor. */
export async function claimRewards(
  pool: Pick<Pool, 'query'>,
  wallet: string
): Promise<{ claimed_count: number; total_xlm: number; tx_hashes: string[] }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query<{
      id: number;
      reward_type: string;
      reward_amount: string;
      tx_hash: string | null;
    }>(
      `UPDATE challenge_rewards
       SET claimed = TRUE, claimed_at = NOW()
       WHERE wallet = $1 AND claimed = FALSE
       RETURNING id, reward_type, reward_amount, tx_hash`,
      [wallet]
    );

    // Mark associated sponsor_daily_challenges as 'claimed'.
    if (result.rows.length > 0) {
      const ids = result.rows.map((r) => r.id);
      await client.query(
        `UPDATE sponsor_daily_challenges
         SET status = 'claimed'
         WHERE wallet = $1
           AND id IN (
             SELECT sponsor_challenge_id FROM challenge_rewards
             WHERE id = ANY($2)
           )`,
        [wallet, ids]
      );
    }

    await client.query('COMMIT');

    const totalXlm = result.rows
      .filter((r) => r.reward_type === 'xlm')
      .reduce((sum, r) => sum + toNum(r.reward_amount), 0);

    return {
      claimed_count: result.rows.length,
      total_xlm: totalXlm,
      tx_hashes: result.rows.map((r) => r.tx_hash).filter(Boolean) as string[],
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ── Streaks ─────────────────────────────────────────────────────────────────

/** Get the current streak for a sponsor. */
async function getStreak(pool: Pick<Pool, 'query'>, wallet: string): Promise<StreakSummary> {
  const result = await pool.query<{
    current_streak: number;
    longest_streak: number;
    streak_multiplier: string;
  }>(
    `SELECT current_streak, longest_streak, streak_multiplier
     FROM sponsor_streaks
     WHERE wallet = $1`,
    [wallet]
  );

  const row = result.rows[0];
  const currentStreak = row?.current_streak ?? 0;
  const longestStreak = row?.longest_streak ?? 0;
  const multiplier = row ? toNum(row.streak_multiplier) : 1;

  // Days until next bonus tier: bonuses at 7, 14, 30 day streaks.
  const tiers = [7, 14, 30];
  let daysUntilNext = 0;
  for (const tier of tiers) {
    if (currentStreak < tier) {
      daysUntilNext = tier - currentStreak;
      break;
    }
  }

  return {
    current_streak: currentStreak,
    longest_streak: longestStreak,
    streak_multiplier: multiplier,
    days_until_next_bonus: daysUntilNext,
  };
}

/** Update the streak when a sponsor completes at least one challenge. */
async function updateStreak(pool: Pick<Pool, 'query'>, wallet: string): Promise<void> {
  const today = todayStr();
  const yesterday = fmtDate(new Date(Date.now() - 86400000));

  const result = await pool.query<{
    current_streak: number;
    longest_streak: number;
    last_active_date: string | null;
  }>(
    'SELECT current_streak, longest_streak, last_active_date FROM sponsor_streaks WHERE wallet = $1',
    [wallet]
  );

  const row = result.rows[0];

  if (!row) {
    // First-ever streak.
    await pool.query(
      `INSERT INTO sponsor_streaks (wallet, current_streak, longest_streak, last_active_date, streak_multiplier)
       VALUES ($1, 1, 1, $2, 1.00)`,
      [wallet, today]
    );
    return;
  }

  if (row.last_active_date === today) {
    // Already active today, no change.
    return;
  }

  const isConsecutive = row.last_active_date === yesterday;
  const newStreak = isConsecutive ? row.current_streak + 1 : 1;
  const newLongest = Math.max(row.longest_streak, newStreak);

  // Compute multiplier: 1.0 base, +0.1 at 7 days, +0.2 at 14, +0.5 at 30.
  let multiplier = 1.0;
  if (newStreak >= 30) multiplier = 1.5;
  else if (newStreak >= 14) multiplier = 1.2;
  else if (newStreak >= 7) multiplier = 1.1;

  await pool.query(
    `UPDATE sponsor_streaks
     SET current_streak = $1, longest_streak = $2, last_active_date = $3, streak_multiplier = $4, updated_at = NOW()
     WHERE wallet = $5`,
    [newStreak, newLongest, today, multiplier.toString(), wallet]
  );
}

// ── Challenge history ───────────────────────────────────────────────────────

/** Get challenge history for a sponsor over the last N days. */
export async function getChallengeHistory(
  pool: Pick<Pool, 'query'>,
  wallet: string,
  days: number = 30
): Promise<ChallengeHistoryEntry[]> {
  const cutoff = fmtDate(new Date(Date.now() - days * 86400000));

  const result = await pool.query<{
    date: string;
    challenges_completed: string;
    xlm_earned: string;
  }>(
    `SELECT
       sdc.assigned_date AS date,
       COUNT(*) FILTER (WHERE sdc.status IN ('completed', 'claimed')) AS challenges_completed,
       COALESCE(SUM(cr.reward_amount) FILTER (WHERE cr.reward_type = 'xlm' AND cr.claimed = TRUE), 0) AS xlm_earned
     FROM sponsor_daily_challenges sdc
     LEFT JOIN challenge_rewards cr ON cr.sponsor_challenge_id = sdc.id
     WHERE sdc.wallet = $1 AND sdc.assigned_date >= $2
     GROUP BY sdc.assigned_date
     ORDER BY sdc.assigned_date DESC`,
    [wallet, cutoff]
  );

  return result.rows.map((r) => ({
    date: r.date,
    challenges_completed: Number(r.challenges_completed),
    xlm_earned: toNum(r.xlm_earned),
  }));
}

// ── Admin: challenge management ─────────────────────────────────────────────

/** Seed a set of reusable daily challenge templates. */
export async function seedChallengeTemplates(
  pool: Pick<Pool, 'query'>
): Promise<{ inserted: number }> {
  const templates = [
    {
      slug: 'plant-5-trees',
      title: 'Plant 5 Trees Today',
      description: 'Sponsor 5 trees in a single day.',
      challenge_type: 'plant_trees' as ChallengeType,
      target_value: 5,
      difficulty: 'easy' as ChallengeDifficulty,
      reward_xlm: 1,
    },
    {
      slug: 'sponsor-rare-species',
      title: 'Sponsor Rare Species',
      description: 'Sponsor a tree of a rare or endangered species.',
      challenge_type: 'sponsor_rare_species' as ChallengeType,
      target_value: 1,
      difficulty: 'medium' as ChallengeDifficulty,
      reward_xlm: 3,
    },
    {
      slug: 'explore-new-region',
      title: 'Explore New Region',
      description: "Sponsor a tree in a region you haven't planted in before.",
      challenge_type: 'sponsor_new_region' as ChallengeType,
      target_value: 1,
      difficulty: 'medium' as ChallengeDifficulty,
      reward_xlm: 2,
    },
    {
      slug: 'three-day-streak',
      title: '3-Day Streak',
      description: 'Sponsor at least one tree for 3 consecutive days.',
      challenge_type: 'sponsor_consecutive_days' as ChallengeType,
      target_value: 3,
      difficulty: 'medium' as ChallengeDifficulty,
      reward_xlm: 3,
    },
    {
      slug: 'bulk-sponsor-10',
      title: 'Bulk Sponsor 10',
      description: 'Sponsor 10 trees in one transaction.',
      challenge_type: 'sponsor_bulk' as ChallengeType,
      target_value: 10,
      difficulty: 'hard' as ChallengeDifficulty,
      reward_xlm: 5,
    },
    {
      slug: 'refer-a-friend',
      title: 'Refer a Friend',
      description: 'Get a friend to sponsor their first tree.',
      challenge_type: 'referral' as ChallengeType,
      target_value: 1,
      difficulty: 'medium' as ChallengeDifficulty,
      reward_xlm: 2,
    },
    {
      slug: 'carbon-100kg',
      title: 'Carbon 100kg Milestone',
      description: 'Reach 100kg of CO₂ sequestered across your sponsored trees.',
      challenge_type: 'carbon_milestone' as ChallengeType,
      target_value: 100,
      difficulty: 'hard' as ChallengeDifficulty,
      reward_xlm: 5,
    },
    {
      slug: 'plant-20-trees',
      title: 'Plant 20 Trees',
      description: 'Sponsor 20 trees in a single day.',
      challenge_type: 'plant_trees' as ChallengeType,
      target_value: 20,
      difficulty: 'epic' as ChallengeDifficulty,
      reward_xlm: 15,
    },
  ];

  let inserted = 0;
  for (const t of templates) {
    const result = await pool.query(
      `INSERT INTO daily_challenges (slug, title, description, challenge_type, target_value, difficulty, reward_xlm)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (slug) DO NOTHING`,
      [
        t.slug,
        t.title,
        t.description,
        t.challenge_type,
        t.target_value,
        t.difficulty,
        t.reward_xlm.toString(),
      ]
    );
    inserted += result.rowCount ?? 0;
  }

  return { inserted };
}
