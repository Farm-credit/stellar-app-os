/**
 * Quarterly conservation-status checker — Issue #1657.
 *
 * Once a quarter this module:
 *   1. picks every species in `species_catalogue` that has not been checked in
 *      the current quarter,
 *   2. asks the IUCN Red List API for its latest assessment,
 *   3. caches the result in `species_iucn_status` (migration 028),
 *   4. detects newly listed / upgraded threatened categories,
 *   5. finds every sponsor holding trees of that species and writes one
 *      `species_conservation_alerts` row per sponsor (deduped per quarter),
 *   6. emails each sponsor the conservation context plus a link to the
 *      platform's educational page for the species.
 *
 * The quarter label is the idempotency key: re-running within the same quarter
 * finds nothing to do, and a retry after a partial failure only touches the
 * species/sponsors it has not already alerted.
 *
 * Scheduling: `POST /api/species/conservation-check` on a quarterly cron
 * (`.github/workflows/species-conservation-cron.yml`).
 */

import type { Pool } from 'pg';
import { logger } from '@/lib/logger';
import {
  alertPriorityFor,
  buildConservationCopy,
  categoryLabel,
  detectConservationChange,
  isThreatenedCategory,
  iucnRecordUrl,
  quarterLabel,
  speciesEducationPath,
  type ConservationChange,
  type IucnCategoryCode,
  type PopulationTrend,
} from './conservation';
import {
  fetchIucnAssessments,
  iucnTokenConfigured,
  type FetchLike,
  type IucnAssessment,
} from './iucn';

// ── Types ────────────────────────────────────────────────────────────────────

/** How a status change is classified when it is persisted as an alert. */
export type ConservationAlertChangeKind = 'newly_listed' | 'upgraded';

export interface SpeciesToCheck {
  slug: string;
  commonName: string;
  scientificName: string;
  /** Previously cached category, or null when never assessed. */
  previousStatusCode: IucnCategoryCode | null;
}

export interface SponsorTarget {
  sponsorWallet: string;
  treeCount: number;
}

export interface SpeciesCheckOutcome {
  slug: string;
  commonName: string;
  scientificName: string;
  previousStatusCode: IucnCategoryCode | null;
  newStatusCode: IucnCategoryCode | null;
  change: ConservationChange | null;
  priority: 'medium' | 'high' | null;
  /** Sponsors that received (or already had) an alert for this change. */
  sponsorsNotified: number;
  /** True when the IUCN API was consulted this run. */
  consultedApi: boolean;
  /** Why the species was skipped, when it was. */
  skippedBecause?: 'no_token' | 'not_found_in_iucn' | 'unchanged' | 'error';
  error?: string;
}

export interface ConservationCheckSummary {
  quarter: string;
  speciesExamined: number;
  speciesSkipped: number;
  changes: SpeciesCheckOutcome[];
  alertsCreated: number;
  emailsSent: number;
  errors: string[];
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

export interface ConservationCheckDeps {
  token?: string | null;
  fetchImpl?: FetchLike;
  /** Injected so tests can control the quarter boundary. */
  asOf?: Date;
  /** Optional cap on species examined per run (development / smoke tests). */
  limit?: number;
  /** Set to false in tests to assert alert rows without hitting SendGrid. */
  sendEmails?: boolean;
  log?: (message: string) => void;
}

// ── Database queries ─────────────────────────────────────────────────────────

/**
 * Species that have not yet been checked in `quarter`. Left-joined against the
 * cached status so the previous category is available for change detection.
 */
export async function fetchSpeciesNeedingCheck(
  pool: Pool,
  quarter: string,
  limit?: number
): Promise<SpeciesToCheck[]> {
  const params: unknown[] = [quarter];
  let limitClause = '';
  if (limit !== undefined && Number.isFinite(limit) && limit > 0) {
    params.push(limit);
    limitClause = `LIMIT $${params.length}`;
  }

  const { rows } = await pool.query(
    `
      SELECT sc.slug,
             sc.common_name,
             sc.scientific_name,
             s.last_status_code
      FROM species_catalogue sc
      LEFT JOIN species_iucn_status s ON s.species_slug = sc.slug
      WHERE s.last_check_quarter IS DISTINCT FROM $1
      ORDER BY sc.slug
      ${limitClause}
    `,
    params
  );

  return rows.map((row) => ({
    slug: row.slug,
    commonName: row.common_name,
    scientificName: row.scientific_name,
    previousStatusCode:
      row.last_status_code && isIucn(row.last_status_code) ? row.last_status_code : null,
  }));
}

function isIucn(value: unknown): value is IucnCategoryCode {
  return typeof value === 'string' && categoryCodeSet.has(value);
}

const categoryCodeSet = new Set<string>(['EX', 'EW', 'CR', 'EN', 'VU', 'NT', 'LC', 'DD', 'NE']);

/** Distinct sponsors holding at least one live tree of `speciesSlug`. */
export async function fetchSponsorsForSpecies(
  pool: Pool,
  speciesSlug: string
): Promise<SponsorTarget[]> {
  const { rows } = await pool.query(
    `
      SELECT sponsor_wallet, COUNT(*)::int AS tree_count
      FROM trees
      WHERE species_slug = $1
        AND sponsor_wallet IS NOT NULL
        AND deleted_at IS NULL
      GROUP BY sponsor_wallet
      ORDER BY tree_count DESC, sponsor_wallet ASC
    `,
    [speciesSlug]
  );

  return rows
    .filter((row) => typeof row.sponsor_wallet === 'string' && row.sponsor_wallet.length > 0)
    .map((row) => ({
      sponsorWallet: row.sponsor_wallet as string,
      treeCount: Number(row.tree_count) || 1,
    }));
}

/**
 * Upserts the cached assessment for one species. Returns `true` when a row was
 * written, so the caller can tell an API miss from a successful cache write.
 */
export async function upsertSpeciesStatus(
  pool: Pool,
  speciesSlug: string,
  assessment: Pick<IucnAssessment, 'taxonId' | 'statusCode' | 'populationTrend' | 'assessedAt'> & {
    statusCode: IucnCategoryCode;
  },
  quarter: string
): Promise<void> {
  await pool.query(
    `
      INSERT INTO species_iucn_status (
        species_slug, iucn_taxon_id, status_code, status_label, population_trend,
        is_threatened, assessed_at, source, first_seen_status,
        last_checked_at, last_check_quarter, consecutive_errors, last_error, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $3,
        NOW(), $9, 0, NULL, NOW()
      )
      ON CONFLICT (species_slug) DO UPDATE SET
        iucn_taxon_id     = EXCLUDED.iucn_taxon_id,
        status_code       = EXCLUDED.status_code,
        status_label      = EXCLUDED.status_label,
        population_trend  = EXCLUDED.population_trend,
        is_threatened     = EXCLUDED.is_threatened,
        assessed_at       = EXCLUDED.assessed_at,
        source            = EXCLUDED.source,
        last_checked_at   = NOW(),
        last_check_quarter = EXCLUDED.last_check_quarter,
        consecutive_errors = 0,
        last_error         = NULL,
        updated_at         = NOW()
    `,
    [
      speciesSlug,
      assessment.taxonId,
      assessment.statusCode,
      categoryLabel(assessment.statusCode),
      assessment.populationTrend,
      isThreatenedCategory(assessment.statusCode),
      assessment.assessedAt,
      JSON.stringify({
        source: 'iucn-red-list-v4',
        taxonId: assessment.taxonId,
        assessedAt: assessment.assessedAt,
      }),
      quarter,
    ]
  );
}

/** Records a failed check so a broken API does not wipe the cached status. */
export async function recordSpeciesCheckError(
  pool: Pool,
  speciesSlug: string,
  message: string
): Promise<void> {
  await pool.query(
    `
      INSERT INTO species_iucn_status (
        species_slug, status_code, status_label, is_threatened,
        first_seen_status, consecutive_errors, last_error, last_checked_at, updated_at
      ) VALUES ($1, 'NE', $2, FALSE, NULL, 1, $3, NOW(), NOW())
      ON CONFLICT (species_slug) DO UPDATE SET
        consecutive_errors = species_iucn_status.consecutive_errors + 1,
        last_error         = EXCLUDED.last_error,
        last_checked_at    = NOW(),
        updated_at         = NOW()
    `,
    [speciesSlug, categoryLabel('NE'), message.slice(0, 500)]
  );
}

/**
 * Writes the alert rows for one species, one per sponsor. `ON CONFLICT DO
 * NOTHING` is the idempotency guard — a sponsor already alerted for this
 * category in this quarter is left untouched.
 */
export async function insertConservationAlerts(
  pool: Pool,
  params: {
    speciesSlug: string;
    commonName: string;
    scientificName: string;
    change: ConservationChange;
    populationTrend: PopulationTrend | null;
    checkQuarter: string;
    sponsors: SponsorTarget[];
  }
): Promise<number> {
  if (params.sponsors.length === 0) return 0;

  const values: unknown[] = [];
  const placeholders: string[] = [];

  params.sponsors.forEach((sponsor, index) => {
    const offset = index * 10;
    placeholders.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, NOW(), NOW())`
    );
    values.push(
      params.speciesSlug,
      params.commonName,
      params.scientificName,
      sponsor.sponsorWallet,
      params.change.kind,
      params.change.previousStatusCode,
      params.change.newStatusCode,
      params.populationTrend,
      sponsor.treeCount,
      params.checkQuarter
    );
  });

  const { rowCount } = await pool.query(
    `
      INSERT INTO species_conservation_alerts (
        species_slug, common_name, scientific_name, sponsor_wallet, change_kind,
        previous_status_code, new_status_code, population_trend, tree_count,
        check_quarter, created_at, updated_at
      ) VALUES ${placeholders.join(', ')}
      ON CONFLICT (species_slug, sponsor_wallet, new_status_code, check_quarter)
      DO NOTHING
    `,
    values
  );

  return rowCount ?? 0;
}

/** Marks the email delivery state for a batch of alert ids. */
export async function markAlertsEmailed(
  pool: Pool,
  alertIds: number[],
  status: 'delivered' | 'failed',
  errorMessage?: string
): Promise<void> {
  if (alertIds.length === 0) return;

  await pool.query(
    `
      UPDATE species_conservation_alerts
      SET status        = $2,
          email_sent_at = CASE WHEN $2 = 'delivered' THEN NOW() ELSE email_sent_at END,
          delivered_at  = CASE WHEN $2 = 'delivered' THEN NOW() ELSE delivered_at END,
          error_count   = CASE WHEN $2 = 'failed' THEN error_count + 1 ELSE error_count END,
          last_error    = $3,
          updated_at    = NOW()
      WHERE id = ANY($1::bigint[])
    `,
    [alertIds, status, errorMessage?.slice(0, 500) ?? null]
  );
}

/** Alert rows that still need an email for this run. */
export async function fetchPendingAlertEmails(
  pool: Pool,
  speciesSlugs: string[],
  checkQuarter: string
): Promise<
  Array<{
    id: number;
    speciesSlug: string;
    commonName: string;
    scientificName: string;
    sponsorWallet: string;
    changeKind: ConservationAlertChangeKind;
    previousStatusCode: IucnCategoryCode | null;
    newStatusCode: IucnCategoryCode;
    populationTrend: PopulationTrend | null;
    treeCount: number;
    checkQuarter: string;
  }>
> {
  if (speciesSlugs.length === 0) return [];

  const { rows } = await pool.query(
    `
      SELECT id, species_slug, common_name, scientific_name, sponsor_wallet,
             change_kind, previous_status_code, new_status_code, population_trend,
             tree_count, check_quarter
      FROM species_conservation_alerts
      WHERE species_slug = ANY($1::text[])
        AND check_quarter = $2
        AND email_sent_at IS NULL
        AND status = 'pending'
      ORDER BY id ASC
    `,
    [speciesSlugs, checkQuarter]
  );

  return rows.map((row) => ({
    id: Number(row.id),
    speciesSlug: row.species_slug,
    commonName: row.common_name,
    scientificName: row.scientific_name,
    sponsorWallet: row.sponsor_wallet,
    changeKind: row.change_kind,
    previousStatusCode: row.previous_status_code ?? null,
    newStatusCode: row.new_status_code,
    populationTrend: row.population_trend ?? null,
    treeCount: Number(row.tree_count) || 1,
    checkQuarter: row.check_quarter,
  }));
}

// ── Orchestration ────────────────────────────────────────────────────────────

export interface RunConservationCheckOptions extends ConservationCheckDeps {
  /** Overrides the derived quarter (used by tests). */
  quarter?: string;
}

/**
 * Checks a single species against one IUCN assessment and persists the result.
 * Split out of {@link runConservationCheck} so the change-detection path is
 * testable without the surrounding orchestration.
 */
export async function checkOneSpecies(
  pool: Pool,
  entry: SpeciesToCheck,
  assessment: IucnAssessment | undefined,
  quarter: string
): Promise<{ outcome: SpeciesCheckOutcome; alertsCreated: number }> {
  const base = {
    slug: entry.slug,
    commonName: entry.commonName,
    scientificName: entry.scientificName,
    previousStatusCode: entry.previousStatusCode,
  };

  // The IUCN API did not return a usable category. Record that the species was
  // looked at this quarter so it is not re-fetched until next quarter, but do
  // not overwrite the cached category with a guess.
  if (!assessment?.statusCode) {
    await markSpeciesChecked(pool, entry.slug, quarter).catch(() => {
      // Species has no cached row yet — nothing to stamp.
    });

    return {
      outcome: {
        ...base,
        newStatusCode: null,
        change: null,
        priority: null,
        sponsorsNotified: 0,
        consultedApi: true,
        skippedBecause: 'not_found_in_iucn',
      },
      alertsCreated: 0,
    };
  }

  const newStatusCode: IucnCategoryCode = assessment.statusCode;
  const change = detectConservationChange(entry.previousStatusCode, newStatusCode);
  await upsertSpeciesStatus(pool, entry.slug, assessment, quarter);

  if (!change) {
    return {
      outcome: {
        ...base,
        newStatusCode,
        change: null,
        priority: null,
        sponsorsNotified: 0,
        consultedApi: true,
        skippedBecause: 'unchanged',
      },
      alertsCreated: 0,
    };
  }

  const sponsors = await fetchSponsorsForSpecies(pool, entry.slug);
  const alertsCreated = await insertConservationAlerts(pool, {
    speciesSlug: entry.slug,
    commonName: entry.commonName,
    scientificName: entry.scientificName,
    change,
    populationTrend: assessment.populationTrend,
    checkQuarter: quarter,
    sponsors,
  });

  return {
    outcome: {
      ...base,
      newStatusCode,
      change,
      priority: alertPriorityFor(newStatusCode),
      sponsorsNotified: alertsCreated,
      consultedApi: true,
    },
    alertsCreated,
  };
}

/** Stamps an already-cached species as checked for `quarter`. */
async function markSpeciesChecked(pool: Pool, speciesSlug: string, quarter: string): Promise<void> {
  await pool.query(
    `UPDATE species_iucn_status
        SET last_check_quarter = $2, last_checked_at = NOW(), updated_at = NOW()
      WHERE species_slug = $1`,
    [speciesSlug, quarter]
  );
}

function emptySummary(
  quarter: string,
  startedAt: Date,
  speciesSkipped: number,
  errors: string[]
): ConservationCheckSummary {
  return {
    quarter,
    speciesExamined: 0,
    speciesSkipped,
    changes: [],
    alertsCreated: 0,
    emailsSent: 0,
    errors,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
  };
}

/**
 * Runs one full quarterly check. Never throws: failures are collected into the
 * summary so a single broken species or unreachable API cannot abort the run.
 */
export async function runConservationCheck(
  pool: Pool,
  options: RunConservationCheckOptions = {}
): Promise<ConservationCheckSummary> {
  const startedAt = new Date();
  const asOf = options.asOf ?? startedAt;
  const quarter = options.quarter ?? quarterLabel(asOf);
  const log = options.log ?? ((message: string) => logger.info(message));
  const sendEmails = options.sendEmails ?? true;
  const errors: string[] = [];
  const changes: SpeciesCheckOutcome[] = [];

  log(`[conservation-check] starting ${quarter} run`);

  const species = await fetchSpeciesNeedingCheck(pool, quarter, options.limit);
  log(`[conservation-check] ${species.length} species due for checking`);

  if (!iucnTokenConfigured(options.token)) {
    log('[conservation-check] IUCN_RED_LIST_API_TOKEN not set — skipping the quarter');
    return emptySummary(quarter, startedAt, species.length, [
      'IUCN_RED_LIST_API_TOKEN is not configured',
    ]);
  }

  // Batch the lookups: one API call covers every species due this quarter.
  let lookupFailed = false;
  const assessments = await fetchIucnAssessments(
    species.map((entry) => entry.scientificName),
    { token: options.token, fetchImpl: options.fetchImpl }
  ).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`IUCN lookup failed: ${message}`);
    log(`[conservation-check] IUCN lookup failed: ${message}`);
    lookupFailed = true;
    return new Map<string, IucnAssessment>();
  });

  // A failed lookup must not stamp anything as checked — otherwise the quarter
  // would be skipped a second time and the alert delayed by another 3 months.
  if (lookupFailed) {
    return emptySummary(quarter, startedAt, species.length, errors);
  }

  let alertsCreated = 0;
  for (const entry of species) {
    const assessment = assessments.get(entry.scientificName.toLowerCase());
    const { outcome, alertsCreated: created } = await checkOneSpecies(
      pool,
      entry,
      assessment,
      quarter
    );
    changes.push(outcome);
    alertsCreated += created;

    if (outcome.change) {
      log(
        `[conservation-check] ${entry.slug}: ${entry.previousStatusCode ?? 'unassessed'} -> ${outcome.newStatusCode} (${outcome.change.kind}), ${created} new alert(s)`
      );
    }
  }

  let emailsSent = 0;
  if (sendEmails && alertsCreated > 0) {
    emailsSent = await sendAlertEmails(pool, quarter, changes, options, log, errors);
  }

  const summary: ConservationCheckSummary = {
    quarter,
    speciesExamined: species.length,
    speciesSkipped: changes.filter((entry) => entry.skippedBecause).length,
    changes,
    alertsCreated,
    emailsSent,
    errors,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
  };

  log(
    `[conservation-check] finished ${quarter}: ${species.length} species, ${alertsCreated} alert(s), ${emailsSent} email(s), ${errors.length} error(s)`
  );

  return summary;
}

/**
 * Sends the alert emails for the alerts created (or left pending) this run.
 * Exposed separately so it is straightforward to test the DB half alone.
 */
export async function sendAlertEmails(
  pool: Pool,
  checkQuarter: string,
  changes: SpeciesCheckOutcome[],
  options: ConservationCheckDeps,
  log: (message: string) => void,
  errors: string[]
): Promise<number> {
  const changedSlugs = changes.filter((entry) => entry.change).map((entry) => entry.slug);
  if (changedSlugs.length === 0) return 0;

  const alerts = await fetchPendingAlertEmails(pool, changedSlugs, checkQuarter);
  if (alerts.length === 0) return 0;

  // Resolve contact details and the education link per species.
  const speciesMeta = new Map<string, { educationUrl: string; taxonId: number | null }>();

  for (const alert of alerts) {
    if (!speciesMeta.has(alert.speciesSlug)) {
      const { rows } = await pool.query(
        `SELECT iucn_taxon_id FROM species_iucn_status WHERE species_slug = $1`,
        [alert.speciesSlug]
      );
      speciesMeta.set(alert.speciesSlug, {
        educationUrl: new URL(
          speciesEducationPath(alert.speciesSlug),
          process.env.NEXT_PUBLIC_APP_URL ?? 'https://harvesta.app'
        ).toString(),
        taxonId: rows[0]?.iucn_taxon_id ?? null,
      });
    }
  }

  const deliveredIds: number[] = [];
  const failedIds: number[] = [];
  let sent = 0;

  for (const alert of alerts) {
    const change = detectConservationChange(alert.previousStatusCode, alert.newStatusCode);
    const meta = speciesMeta.get(alert.speciesSlug);
    if (!meta) continue;

    const contact = await fetchSponsorContact(pool, alert.sponsorWallet);

    if (!contact?.email) {
      // No email on file — still deliver in-app, just skip the email leg.
      deliveredIds.push(alert.id);
      continue;
    }

    const copy = buildConservationCopy({
      change: change ?? {
        kind: 'newly_listed',
        previousStatusCode: alert.previousStatusCode,
        newStatusCode: alert.newStatusCode,
      },
      commonName: alert.commonName,
      scientificName: alert.scientificName,
      populationTrend: alert.populationTrend,
      treeCount: alert.treeCount,
      checkQuarter: alert.checkQuarter,
      educationUrl: meta.educationUrl,
      iucnUrl: iucnRecordUrl(meta.taxonId, alert.scientificName),
    });

    try {
      const { sendSpeciesConservationAlertEmail } = await import('@/lib/email/sendgrid');
      await sendSpeciesConservationAlertEmail({
        to: contact.email,
        sponsorName: contact.name,
        subject: copy.subject,
        summary: copy.summary,
        body: copy.body,
        speciesCommonName: alert.commonName,
        scientificName: alert.scientificName,
        statusCode: alert.newStatusCode,
        statusLabel: categoryLabel(alert.newStatusCode),
        populationTrend: alert.populationTrend,
        changeKind: alert.changeKind,
        treeCount: alert.treeCount,
        checkQuarter: alert.checkQuarter,
        educationUrl: meta.educationUrl,
        iucnUrl: iucnRecordUrl(meta.taxonId, alert.scientificName),
      });
      deliveredIds.push(alert.id);
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failedIds.push(alert.id);
      errors.push(`email ${alert.id} (${alert.sponsorWallet}): ${message}`);
      log(`[conservation-check] email failed for alert ${alert.id}: ${message}`);
    }
  }

  await markAlertsEmailed(pool, deliveredIds, 'delivered');
  await markAlertsEmailed(pool, failedIds, 'failed', 'email delivery failed');

  return sent;
}

interface SponsorContact {
  email: string | null;
  name: string | null;
}

/**
 * Best-effort sponsor contact lookup. Sponsor email is optional and is keyed by
 * wallet only in some signup paths, so a null result simply means "in-app
 * alert only" — the alert row is still marked delivered.
 */
export async function fetchSponsorContact(
  pool: Pool,
  sponsorWallet: string
): Promise<SponsorContact | null> {
  try {
    const { rows } = await pool.query(
      `SELECT email, NULL::text AS name
         FROM sponsorship_subscriptions
        WHERE wallet = $1 AND email IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 1`,
      [sponsorWallet]
    );
    const row = rows[0];
    return row?.email ? { email: row.email as string, name: (row.name as string) ?? null } : null;
  } catch {
    return null;
  }
}
