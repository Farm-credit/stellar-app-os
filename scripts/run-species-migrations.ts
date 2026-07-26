#!/usr/bin/env tsx

/**
 * CLI runner for Species Catalog automated DB migrations & seed script
 * Issue #819
 */

import { runSpeciesCatalogMigrations } from '../lib/db/species-migration-runner';

async function main() {
  console.log('[Species Migrations] Starting automated database migration runner...');
  try {
    const result = await runSpeciesCatalogMigrations();
    console.log('[Species Migrations] Success!');
    console.log(`- Applied migrations: ${result.appliedCount}`);
    console.log(`- Already applied: ${result.alreadyAppliedFiles.length}`);
    console.log(`- Species catalog seeded: ${result.speciesSeededCount}`);
    process.exit(0);
  } catch (err) {
    console.error('[Species Migrations] Fatal error running migrations:', err);
    process.exit(1);
  }
}

main();
