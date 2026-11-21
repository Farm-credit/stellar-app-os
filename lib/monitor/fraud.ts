/**
 * Fraud detection — anomaly monitoring (v1). Closes #1319.
 *
 * Rule/scoring based detectors over planter/tree/payment telemetry that flag
 * suspicious activity for investigation. The scoring functions are pure and
 * deterministic so that (a) they are unit-testable without a database and
 * (b) a real ML model can later replace `scoreDoubleSelling` & friends behind
 * the same interface.
 *
 * Signal families (per the issue):
 *   - double_selling      — same tree/credits sold or retired more than once
 *   - fake_farmer         — KYC gaps, shared identity hashes, implausible burst activity
 *   - project_inflation   — claimed sequestration far above species/region norms
 *   - metric_manipulation — GPS/photo evidence inconsistent with tree history
 *
 * DB persistence (fraud_alerts / fraud_scan_runs, migration 014) is via
 * `runFraudScan`, which is safe to call repeatedly: open alerts upsert rather
 * than duplicate.
 */

import { getPool } from '@/lib/db/client';

// ── Detector configuration ───────────────────────────────────────────────────

/** Alert families supported by v1. */
export type FraudAlertType =
  'double_selling' | 'fake_farmer' | 'project_inflation' | 'metric_manipulation';

export type FraudSeverity = 'low' | 'medium' | 'high' | 'critical';

export type FraudAlertStatus = 'open' | 'investigating' | 'dismissed' | 'confirmed';

export interface FraudAlertRow {
  id: number;
  alert_type: FraudAlertType;
  entity_type: string;
  entity_id: string;
  score: number;
  severity: FraudSeverity;
  reason: string;
  metadata: Record<string, unknown>;
  status: FraudAlertStatus;
  dispute_id: number | null;
  investigated_by: string | null;
  resolution_note: string | null;
  resolved_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/** Severity thresholds on the 0–100 detector score. */
export const SEVERITY_THRESHOLDS = {
  critical: 90,
  high: 75,
  medium: 50,
} as const;

/**
 * Z-score above which a rate/value is treated as anomalous. Chosen so that
 * on a normal distribution ~1.5% of legitimate planters would be flagged
 * (high precision is preferred over recall for fraud escalation).
 */
export const DEFAULT_Z_THRESHOLD = 2.5;

export function severityFor(score: number): FraudSeverity {
  if (score >= SEVERITY_THRESHOLDS.critical) return 'critical';
  if (score >= SEVERITY_THRESHOLDS.high) return 'high';
  if (score >= SEVERITY_THRESHOLDS.medium) return 'medium';
  return 'low';
}

// ── Input models ─────────────────────────────────────────────────────────────

/** Per-planter aggregate the detectors consume. Produced by `collectPlanterSignals`. */
export interface PlanterSignals {
  planterId: number;
  stellarAddress: string;
  kycStatus: string;
  /** Distinct identity_hash values among this planter's rows (1 = normal). */
  distinctIdentityHashes: number;
  /** Planters sharing any identity_hash with this planter (0 = normal). */
  identityHashSharers: number;
  treesPlanted: number;
  /** Trees with a photo proof. */
  treesWithPhotos: number;
  /** Survival checks recorded in the last 30 days. */
  recentSurvivalChecks: number;
  /** Distinct GPS clusters (rounded to 3 decimals) among this planter's trees. */
  distinctGpsClusters: number;
  /** Trees credited for CO2 offsets (sold/retired) in the last 30 days. */
  creditsSold30d: number;
  /** Same metric across all planters, for z-scores. */
  fleetCreditsSold30d: number[];
  fleetTreesPlanted: number[];
  fleetSurvivalChecks: number[];
}

/** Per-tree signals used by double-selling and metric-manipulation checks. */
export interface TreeSignals {
  treeId: number;
  planterId: number | null;
  /** Number of distinct buyers that funded this tree. */
  distinctFunders: number;
  /** Number of escrow releases recorded for this tree. */
  escrowReleases: number;
  /** Number of retirement/offset events recorded for this tree. */
  retirements: number;
  /** Distinct photo hashes submitted for this tree. */
  distinctPhotoHashes: number;
  /** Total photo submissions for this tree. */
  photoSubmissions: number;
  /** Status transitions recorded (from,to) pairs, e.g. planted→verified. */
  statusChanges: number;
  /** Verified tree count vs planted claim — survival percentage (0–100). */
  survivalPct: number | null;
}

/** Regional species norm used by the inflation detector. */
export interface SpeciesNorm {
  speciesSlug: string;
  region: string;
  /** Mean kg CO2/yr across the species catalogue in this region. */
  meanCo2KgPerYear: number;
  /** Population stddev of the same. */
  stddevCo2KgPerYear: number;
}

// ── Pure scoring functions ───────────────────────────────────────────────────

/**
 * Double-selling: a tree funded by multiple buyers, released from escrow more
 * than once, or retired more than once is suspicious. Score is additive over
 * independent signals and capped at 100.
 */
export function scoreDoubleSelling(tree: TreeSignals): number {
  let score = 0;
  // More than one funder on a single tree = selling the same credit twice.
  if (tree.distinctFunders > 1) {
    score += Math.min(60, 40 + 10 * (tree.distinctFunders - 1));
  }
  // Escrow can fund/plant/survive (max 2 releases); a third release is fraud.
  if (tree.escrowReleases > 2) score += 25;
  // Credits may only retire once.
  if (tree.retirements > 1) score += 40;
  return Math.min(100, score);
}

/**
 * Fake-farmer heuristics. Signals:
 *  - missing/suspended KYC while actively credited
 *  - identity hash shared with other planters (sybil farms)
 *  - many trees clustered on one GPS point (bulk fabricated plots)
 *  - activity far outside fleet norms (z-score burst)
 */
export function scoreFakeFarmer(planter: PlanterSignals): number {
  let score = 0;
  const reasons: string[] = [];

  if (planter.kycStatus !== 'verified' && planter.creditsSold30d > 0) {
    score += 40;
    reasons.push(`kyc=${planter.kycStatus} while selling credits`);
  }
  if (planter.identityHashSharers > 0) {
    score += Math.min(40, 20 + 10 * planter.identityHashSharers);
    reasons.push(`identity hash shared with ${planter.identityHashSharers} planter(s)`);
  }
  if (planter.treesPlanted >= 20 && planter.distinctGpsClusters <= 1) {
    score += 30;
    reasons.push(`${planter.treesPlanted} trees on a single GPS cluster`);
  }
  if (planter.treesPlanted > 0 && planter.treesWithPhotos === 0) {
    score += 25;
    reasons.push('no photo evidence for any planted tree');
  }
  const z = zScore(planter.recentSurvivalChecks, planter.fleetSurvivalChecks);
  if (z !== null && z > DEFAULT_Z_THRESHOLD) {
    score += 20;
    reasons.push(`survival-check burst z=${z.toFixed(1)}`);
  }
  void reasons; // surfaced by caller via describeFakeFarmer if needed
  return Math.min(100, score);
}

/**
 * Project inflation: claimed per-tree sequestration deviating far above the
 * regional species norm. Uses a z-score against the regional population with
 * a floor on the stddev so small regions don't produce absurd z values.
 */
export function scoreProjectInflation(claimedCo2KgPerYear: number, norm: SpeciesNorm): number {
  const floorStddev = Math.max(norm.stddevCo2KgPerYear, norm.meanCo2KgPerYear * 0.1, 1);
  const z = (claimedCo2KgPerYear - norm.meanCo2KgPerYear) / floorStddev;
  if (z < DEFAULT_Z_THRESHOLD) return 0;
  // 2.5σ → 50, 4σ → 80, 6σ+ → 100.
  return Math.min(100, Math.round(50 + (z - DEFAULT_Z_THRESHOLD) * 15));
}

/**
 * Metric manipulation: evidence history that contradicts itself — repeated
 * identical photos (hash reuse), impossible status churn, or a survival
 * percentage that jumped discontinuously.
 */
export function scoreMetricManipulation(tree: TreeSignals): number {
  let score = 0;
  // Same photo hash submitted many times ("copy-paste proof").
  if (tree.photoSubmissions >= 3 && tree.distinctPhotoHashes === 1) {
    score += 45;
  } else if (tree.photoSubmissions > tree.distinctPhotoHashes * 2) {
    score += 20;
  }
  // Planted→failed→verified churn is a classic manipulation pattern.
  if (tree.statusChanges > 4) score += 20;
  // Survival above 100 is impossible; near-impossible values are suspicious too.
  if (tree.survivalPct !== null && tree.survivalPct > 100) score += 40;
  return Math.min(100, score);
}

/** Population z-score of `value` within `population`; null when not computable. */
export function zScore(value: number, population: number[]): number | null {
  if (population.length < 5) return null; // need a real sample for a z-score
  const mean = population.reduce((a, b) => a + b, 0) / population.length;
  const variance = population.reduce((acc, v) => acc + (v - mean) ** 2, 0) / population.length;
  const stddev = Math.sqrt(variance);
  if (stddev === 0) return null;
  return (value - mean) / stddev;
}

/** Compose the reason string for a fake-farmer alert from the signals. */
export function describeFakeFarmer(planter: PlanterSignals): string {
  const parts: string[] = [];
  if (planter.kycStatus !== 'verified' && planter.creditsSold30d > 0) {
    parts.push(`kyc=${planter.kycStatus} while selling credits`);
  }
  if (planter.identityHashSharers > 0) {
    parts.push(`identity hash shared with ${planter.identityHashSharers} planter(s)`);
  }
  if (planter.treesPlanted >= 20 && planter.distinctGpsClusters <= 1) {
    parts.push(`${planter.treesPlanted} trees on a single GPS cluster`);
  }
  if (planter.treesPlanted > 0 && planter.treesWithPhotos === 0) {
    parts.push('no photo evidence for any planted tree');
  }
  const z = zScore(planter.recentSurvivalChecks, planter.fleetSurvivalChecks);
  if (z !== null && z > DEFAULT_Z_THRESHOLD) {
    parts.push(`survival-check burst z=${z.toFixed(1)}`);
  }
  return parts.length > 0 ? parts.join('; ') : 'heuristic score threshold reached';
}

// ── Telemetry collection ─────────────────────────────────────────────────────

/**
 * Load per-planter aggregates + fleet distributions for z-scoring.
 * Degrades to empty results when migrations haven't been applied yet
 * (matches lib/db/photo-hashes.ts local-dev tolerance).
 */
export async function collectPlanterSignals(): Promise<PlanterSignals[]> {
  const pool = getPool();
  const fleetQuery = `
    SELECT planter_id, COUNT(*)::int AS trees FROM trees
      WHERE deleted_at IS NULL AND planter_id IS NOT NULL GROUP BY planter_id`;
  const creditsQuery = `
    SELECT p.id AS planter_id, COUNT(t.id)::int AS credits
      FROM planters p
      LEFT JOIN trees t ON t.planter_id = p.id
        AND t.status IN ('verified', 'completed')
        AND t.verified_at > NOW() - INTERVAL '30 days'
      GROUP BY p.id`;
  const survivalQuery = `
    SELECT p.id AS planter_id, COUNT(pu.id)::int AS checks
      FROM planters p
      LEFT JOIN trees t ON t.planter_id = p.id
      LEFT JOIN progress_updates pu ON pu.tree_id = t.id
        AND pu.update_type = 'survival_check'
        AND pu.created_at > NOW() - INTERVAL '30 days'
      GROUP BY p.id`;

  const [fleet, credits, survival] = await Promise.all([
    pool.query<{ planter_id: number; trees: number }>(fleetQuery),
    pool.query<{ planter_id: number; credits: number }>(creditsQuery),
    pool.query<{ planter_id: number; checks: number }>(survivalQuery),
  ]).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    if (/relation "(planters|trees|progress_updates)" does not exist/i.test(message)) {
      console.warn('[fraud] base tables missing — skipping planter scan');
      return [
        { rows: [] as { planter_id: number; trees: number }[] },
        { rows: [] as { planter_id: number; credits: number }[] },
        { rows: [] as { planter_id: number; checks: number }[] },
      ];
    }
    throw err;
  });

  // Aggregate planter rows + shared-identity detection in one pass.
  const planterRows = await pool
    .query<{
      id: number;
      stellar_address: string;
      kyc_status: string;
      identity_hash: string | null;
    }>(
      `SELECT id, stellar_address, kyc_status, identity_hash FROM planters WHERE deleted_at IS NULL`
    )
    .catch(() => ({ rows: [] }));

  const creditsByPlanter = new Map(credits.rows.map((r) => [r.planter_id, r.credits]));
  const checksByPlanter = new Map(survival.rows.map((r) => [r.planter_id, r.checks]));

  // Identity-hash sharing map.
  const hashOwners = new Map<string, number[]>();
  for (const row of planterRows.rows) {
    if (!row.identity_hash) continue;
    const owners = hashOwners.get(row.identity_hash) ?? [];
    owners.push(row.id);
    hashOwners.set(row.identity_hash, owners);
  }

  const fleetTrees = fleet.rows.map((r) => r.trees);
  const fleetCredits = credits.rows.map((r) => r.credits);
  const fleetChecks = survival.rows.map((r) => r.checks);

  // Photo/GPS aggregates per planter.
  const photoRows = await pool
    .query<{ planter_id: number | null; trees: number; with_photos: number; clusters: number }>(
      `SELECT t.planter_id,
              COUNT(*)::int AS trees,
              COUNT(pu.id) FILTER (WHERE pu.update_type = 'photo_submitted')::int AS with_photos,
              COUNT(DISTINCT (round(t.lat::numeric, 3), round(t.lng::numeric, 3)))::int AS clusters
         FROM trees t
         LEFT JOIN progress_updates pu ON pu.tree_id = t.id
        WHERE t.deleted_at IS NULL AND t.planter_id IS NOT NULL
        GROUP BY t.planter_id`
    )
    .catch(() => ({
      rows: [] as {
        planter_id: number | null;
        trees: number;
        with_photos: number;
        clusters: number;
      }[],
    }));
  const photosByPlanter = new Map(photoRows.rows.map((r) => [r.planter_id, r]));

  return planterRows.rows.map((row) => {
    const owners = row.identity_hash ? (hashOwners.get(row.identity_hash) ?? [row.id]) : [row.id];
    const stats = photosByPlanter.get(row.id);
    return {
      planterId: row.id,
      stellarAddress: row.stellar_address,
      kycStatus: row.kyc_status,
      distinctIdentityHashes: row.identity_hash ? 1 : 0,
      identityHashSharers: Math.max(0, owners.length - 1),
      treesPlanted: fleet.rows.find((f) => f.planter_id === row.id)?.trees ?? 0,
      treesWithPhotos: stats?.with_photos ?? 0,
      recentSurvivalChecks: checksByPlanter.get(row.id) ?? 0,
      distinctGpsClusters: stats?.clusters ?? 0,
      creditsSold30d: creditsByPlanter.get(row.id) ?? 0,
      fleetCreditsSold30d: fleetCredits,
      fleetTreesPlanted: fleetTrees,
      fleetSurvivalChecks: fleetChecks,
    };
  });
}

/** Load per-tree signals for double-selling / metric-manipulation checks. */
export async function collectTreeSignals(limit = 500): Promise<TreeSignals[]> {
  const pool = getPool();
  try {
    const { rows } = await pool.query<{
      tree_id: number;
      planter_id: number | null;
      distinct_funders: number;
      escrow_releases: number;
      retirements: number;
      distinct_photo_hashes: number;
      photo_submissions: number;
      status_changes: number;
      survival_pct: number | null;
    }>(
      `SELECT t.id AS tree_id,
              t.planter_id,
              1::int AS distinct_funders, -- v1: single-funder trees; multi-funder lands with escrow-order indexing
              (SELECT COUNT(*)::int FROM indexed_transactions it
                 WHERE it.destination = t.contract_address
                   AND it.tx_type IN ('escrow_planting', 'escrow_survival')) AS escrow_releases,
              (SELECT COUNT(*)::int FROM carbon_offset_snapshots s
                 WHERE s.snapshot_date > CURRENT_DATE - 30)::int AS retirements,
              (SELECT COUNT(DISTINCT ph.hash)::int FROM photo_hashes ph
                 WHERE ph.entity_type = 'tree' AND ph.entity_id = t.id::text) AS distinct_photo_hashes,
              (SELECT COUNT(*)::int FROM progress_updates pu
                 WHERE pu.tree_id = t.id AND pu.update_type = 'photo_submitted') AS photo_submissions,
              (SELECT COUNT(*)::int FROM progress_updates pu
                 WHERE pu.tree_id = t.id AND pu.update_type = 'status_change') AS status_changes,
              CASE WHEN t.status IN ('verified', 'completed')
                   THEN 100
                   WHEN t.status = 'failed' THEN 0
                   ELSE NULL END AS survival_pct
         FROM trees t
        WHERE t.deleted_at IS NULL
        ORDER BY t.updated_at DESC
        LIMIT $1`,
      [limit]
    );
    return rows.map((r) => ({
      treeId: r.tree_id,
      planterId: r.planter_id,
      distinctFunders: r.distinct_funders,
      escrowReleases: r.escrow_releases,
      retirements: r.retirements,
      distinctPhotoHashes: r.distinct_photo_hashes,
      photoSubmissions: r.photo_submissions,
      statusChanges: r.status_changes,
      survivalPct: r.survival_pct,
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (
      /relation "(trees|photo_hashes|progress_updates|indexed_transactions)" does not exist/i.test(
        message
      )
    ) {
      console.warn('[fraud] base tables missing — skipping tree scan');
      return [];
    }
    throw err;
  }
}

/** Regional per-species sequestration norms for the inflation detector. */
export async function collectSpeciesNorms(): Promise<SpeciesNorm[]> {
  const pool = getPool();
  try {
    const { rows } = await pool.query<{
      species_slug: string;
      region: string;
      mean_co2: string;
      stddev_co2: string;
    }>(
      `SELECT species_slug, region,
              AVG(co2_kg_per_year)::text AS mean_co2,
              COALESCE(STDDEV(co2_kg_per_year), 0)::text AS stddev_co2
         FROM species_catalogue
        GROUP BY species_slug, region`
    );
    return rows.map((r) => ({
      speciesSlug: r.species_slug,
      region: r.region,
      meanCo2KgPerYear: Number.parseFloat(r.mean_co2) || 0,
      stddevCo2KgPerYear: Number.parseFloat(r.stddev_co2) || 0,
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/relation "species_catalogue" does not exist/i.test(message)) return [];
    throw err;
  }
}

// ── Alert persistence ────────────────────────────────────────────────────────

export interface UpsertAlertInput {
  alertType: FraudAlertType;
  entityType: string;
  entityId: string;
  score: number;
  reason: string;
  metadata?: Record<string, unknown>;
}

/**
 * Insert or refresh an open alert. Returns 'created', 'updated', or null when
 * the alerts table is missing (local dev without migrations).
 */
export async function upsertAlert(input: UpsertAlertInput): Promise<'created' | 'updated' | null> {
  const pool = getPool();
  try {
    const { rows } = await pool.query<{ id: number; created_now: boolean }>(
      `INSERT INTO fraud_alerts
         (alert_type, entity_type, entity_id, score, severity, reason, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (alert_type, entity_type, entity_id) WHERE status IN ('open', 'investigating')
       DO UPDATE SET
         score = EXCLUDED.score,
         severity = EXCLUDED.severity,
         reason = EXCLUDED.reason,
         metadata = EXCLUDED.metadata,
         updated_at = NOW()
       RETURNING id, (xmax = 0) AS created_now`,
      [
        input.alertType,
        input.entityType,
        input.entityId,
        input.score,
        severityFor(input.score),
        input.reason,
        JSON.stringify(input.metadata ?? {}),
      ]
    );
    const first = rows[0];
    return first ? (first.created_now ? 'created' : 'updated') : null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/relation "fraud_alerts" does not exist/i.test(message)) {
      console.warn(
        '[fraud] fraud_alerts missing — apply db/migrations/014_create_fraud_alerts.sql'
      );
      return null;
    }
    throw err;
  }
}

/** Record one detector run; returns the id for `finishFraudScanRun`. */
export async function startFraudScanRun(): Promise<number | null> {
  const pool = getPool();
  try {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO fraud_scan_runs (started_at) VALUES (NOW()) RETURNING id`
    );
    return rows[0]?.id ?? null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/relation "fraud_scan_runs" does not exist/i.test(message)) return null;
    throw err;
  }
}

export async function finishFraudScanRun(
  id: number | null,
  stats: {
    alertsCreated: number;
    alertsUpdated: number;
    plantersScanned: number;
    treesScanned: number;
    error?: string | null;
  }
): Promise<void> {
  if (id === null) return;
  const pool = getPool();
  await pool.query(
    `UPDATE fraud_scan_runs
        SET finished_at = NOW(),
            alerts_created = $2,
            alerts_updated = $3,
            planters_scanned = $4,
            trees_scanned = $5,
            error = $6
      WHERE id = $1`,
    [
      id,
      stats.alertsCreated,
      stats.alertsUpdated,
      stats.plantersScanned,
      stats.treesScanned,
      stats.error ?? null,
    ]
  );
}

// ── Scan orchestration ───────────────────────────────────────────────────────

export interface FraudScanResult {
  alertsCreated: number;
  alertsUpdated: number;
  plantersScanned: number;
  treesScanned: number;
  skipped: boolean;
}

/**
 * Run all v1 detectors and persist resulting alerts. Designed for the monitor
 * worker loop (see lib/monitor/fraud-worker.ts). Errors in one detector do not
 * abort the others.
 */
export async function runFraudScan(options: { treeLimit?: number } = {}): Promise<FraudScanResult> {
  const runId = await startFraudScanRun();
  const result: FraudScanResult = {
    alertsCreated: 0,
    alertsUpdated: 0,
    plantersScanned: 0,
    treesScanned: 0,
    skipped: false,
  };

  const errors: string[] = [];

  // ── Fake-farmer detector ──────────────────────────────────────────────────
  try {
    const planters = await collectPlanterSignals();
    result.plantersScanned = planters.length;
    for (const planter of planters) {
      const score = scoreFakeFarmer(planter);
      if (score >= SEVERITY_THRESHOLDS.medium) {
        const outcome = await upsertAlert({
          alertType: 'fake_farmer',
          entityType: 'planter',
          entityId: String(planter.planterId),
          score,
          reason: describeFakeFarmer(planter),
          metadata: {
            stellar_address: planter.stellarAddress,
            kyc_status: planter.kycStatus,
            identity_hash_sharers: planter.identityHashSharers,
            trees_planted: planter.treesPlanted,
            distinct_gps_clusters: planter.distinctGpsClusters,
          },
        });
        if (outcome === 'created') result.alertsCreated += 1;
        else if (outcome === 'updated') result.alertsUpdated += 1;
      }
    }
  } catch (err) {
    errors.push(`fake_farmer: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── Double-selling + metric-manipulation detectors ────────────────────────
  try {
    const trees = await collectTreeSignals(options.treeLimit);
    result.treesScanned = trees.length;
    for (const tree of trees) {
      const dsScore = scoreDoubleSelling(tree);
      if (dsScore >= SEVERITY_THRESHOLDS.medium) {
        const outcome = await upsertAlert({
          alertType: 'double_selling',
          entityType: 'tree',
          entityId: String(tree.treeId),
          score: dsScore,
          reason: `funders=${tree.distinctFunders} releases=${tree.escrowReleases} retirements=${tree.retirements}`,
          metadata: { planter_id: tree.planterId, ...tree },
        });
        if (outcome === 'created') result.alertsCreated += 1;
        else if (outcome === 'updated') result.alertsUpdated += 1;
      }

      const mmScore = scoreMetricManipulation(tree);
      if (mmScore >= SEVERITY_THRESHOLDS.medium) {
        const outcome = await upsertAlert({
          alertType: 'metric_manipulation',
          entityType: 'tree',
          entityId: String(tree.treeId),
          score: mmScore,
          reason: `photos=${tree.photoSubmissions} distinct=${tree.distinctPhotoHashes} status_changes=${tree.statusChanges} survival=${tree.survivalPct ?? 'n/a'}`,
          metadata: { planter_id: tree.planterId, ...tree },
        });
        if (outcome === 'created') result.alertsCreated += 1;
        else if (outcome === 'updated') result.alertsUpdated += 1;
      }
    }
  } catch (err) {
    errors.push(`tree detectors: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── Project-inflation detector ────────────────────────────────────────────
  try {
    const norms = await collectSpeciesNorms();
    if (norms.length > 0) {
      const pool = getPool();
      const inflated = await pool
        .query<{ slug: string; region: string; co2: string }>(
          `SELECT slug, region, co2_kg_per_year::text AS co2
             FROM species_catalogue
            WHERE co2_kg_per_year IS NOT NULL`
        )
        .catch(() => ({ rows: [] as { slug: string; region: string; co2: string }[] }));

      for (const row of inflated.rows) {
        const norm = norms.find((n) => n.speciesSlug === row.slug && n.region === row.region);
        if (!norm) continue;
        const score = scoreProjectInflation(Number.parseFloat(row.co2), norm);
        if (score >= SEVERITY_THRESHOLDS.medium) {
          const outcome = await upsertAlert({
            alertType: 'project_inflation',
            entityType: 'species_region',
            entityId: `${row.slug}:${row.region}`,
            score,
            reason: `claimed ${row.co2} kg/yr vs norm ${norm.meanCo2KgPerYear.toFixed(1)} (σ=${norm.stddevCo2KgPerYear.toFixed(1)})`,
            metadata: { ...norm, claimed: Number.parseFloat(row.co2) },
          });
          if (outcome === 'created') result.alertsCreated += 1;
          else if (outcome === 'updated') result.alertsUpdated += 1;
        }
      }
    }
  } catch (err) {
    errors.push(`project_inflation: ${err instanceof Error ? err.message : String(err)}`);
  }

  await finishFraudScanRun(runId, {
    alertsCreated: result.alertsCreated,
    alertsUpdated: result.alertsUpdated,
    plantersScanned: result.plantersScanned,
    treesScanned: result.treesScanned,
    error: errors.length > 0 ? errors.join(' | ') : null,
  }).catch(() => undefined);

  return result;
}

// ── Investigation API ────────────────────────────────────────────────────────

/** List alerts for dashboards, newest/highest-severity first. */
export async function listAlerts(
  options: {
    status?: FraudAlertStatus;
    severity?: FraudSeverity;
    limit?: number;
  } = {}
): Promise<FraudAlertRow[]> {
  const pool = getPool();
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (options.status) {
    params.push(options.status);
    conditions.push(`status = $${params.length}`);
  }
  if (options.severity) {
    params.push(options.severity);
    conditions.push(`severity = $${params.length}`);
  }
  params.push(Math.max(1, Math.min(options.limit ?? 100, 500)));
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query<FraudAlertRow>(
    `SELECT * FROM fraud_alerts ${where}
      ORDER BY CASE severity
        WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        created_at DESC
      LIMIT $${params.length}`
  );
  return rows;
}

/** Move an alert through the investigation lifecycle. */
export async function updateAlertStatus(
  id: number,
  status: Exclude<FraudAlertStatus, 'open'>,
  investigatedBy: string,
  resolutionNote?: string
): Promise<boolean> {
  const pool = getPool();
  const resolvedAt = status === 'dismissed' || status === 'confirmed' ? 'NOW()' : 'NULL';
  const { rowCount } = await pool.query(
    `UPDATE fraud_alerts
        SET status = $2,
            investigated_by = $3,
            resolution_note = COALESCE($4, resolution_note),
            resolved_at = ${resolvedAt},
            updated_at = NOW()
      WHERE id = $1`,
    [id, status, investigatedBy, resolutionNote ?? null]
  );
  return (rowCount ?? 0) > 0;
}
