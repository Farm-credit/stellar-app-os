/**
 * CLI entry point for the quarterly IUCN conservation check (Issue #1657).
 *
 * Usage:
 *   pnpm species:conservation-check
 *
 * Scheduling: .github/workflows/species-conservation-cron.yml runs this once
 * a quarter. The same logic is reachable over HTTP via
 * POST /api/species/conservation-check for platforms that prefer a cron
 * hitting an endpoint.
 *
 * Required env vars:
 *   DATABASE_URL                       — postgres connection (see lib/db/client)
 *   IUCN_RED_LIST_API_TOKEN            — IUCN Red List API v4 token
 *   SPECIES_CONSERVATION_CRON_SECRET   — only needed for the HTTP route
 *   SENDGRID_API_KEY / SENDGRID_FROM_EMAIL — optional; without them alerts are
 *                                        still recorded but emails are skipped
 */

import { getPool } from '@/lib/db/client';
import { runConservationCheck } from '@/lib/species/conservation-checker';

async function main() {
  const summary = await runConservationCheck(getPool(), {
    log: (message) => console.info(message),
  });

  console.info(
    '[conservation-check] quarter=%s examined=%d skipped=%d changes=%d alerts=%d emails=%d errors=%d',
    summary.quarter,
    summary.speciesExamined,
    summary.speciesSkipped,
    summary.changes.filter((entry) => entry.change).length,
    summary.alertsCreated,
    summary.emailsSent,
    summary.errors.length
  );

  for (const entry of summary.changes) {
    if (!entry.change) continue;
    console.info(
      '  %s (%s): %s -> %s (%s) — %d sponsor alert(s)',
      entry.slug,
      entry.scientificName,
      entry.previousStatusCode ?? 'unassessed',
      entry.newStatusCode,
      entry.change.kind,
      entry.sponsorsNotified
    );
  }

  if (summary.errors.length > 0) {
    for (const error of summary.errors) console.warn('  ! %s', error);
    // A partial run is still a successful run — the quarter is stamped per
    // species, so anything that failed is retried next quarter.
    process.exitCode = summary.alertsCreated > 0 ? 0 : 1;
  }
}

main().catch((err) => {
  console.error('[conservation-check] fatal:', err);
  process.exit(1);
});
