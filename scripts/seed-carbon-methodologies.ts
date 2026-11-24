/**
 * seed-carbon-methodologies.ts — Carbon methodology library (v1)
 *
 * Validates data/carbon-methodologies/*.json and upserts every entry into the
 * carbon_methodologies table (migration 025). Idempotent: safe to re-run.
 *
 * Usage:
 *   pnpm seed:methodologies              # validate + upsert
 *   pnpm seed:methodologies -- --dry-run # validate only, no database needed
 *
 * Required env vars (unless --dry-run):
 *   DATABASE_URL — postgres connection string
 */

import { Pool } from 'pg';
import { loadMethodologyDataset } from '../lib/carbon/methodologies/dataset';
import { METHODOLOGY_CATEGORIES } from '../lib/carbon/methodologies/types';

const UPSERT_SQL = `
  INSERT INTO carbon_methodologies
    (slug, code, name, category, standard, version, description, formula,
     parameters, applicability, source_ref, metadata_verified, updated_at)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,NOW())
  ON CONFLICT (slug) DO UPDATE SET
    code              = EXCLUDED.code,
    name              = EXCLUDED.name,
    category          = EXCLUDED.category,
    standard          = EXCLUDED.standard,
    version           = EXCLUDED.version,
    description       = EXCLUDED.description,
    formula           = EXCLUDED.formula,
    parameters        = EXCLUDED.parameters,
    applicability     = EXCLUDED.applicability,
    source_ref        = EXCLUDED.source_ref,
    metadata_verified = EXCLUDED.metadata_verified,
    updated_at        = NOW()
`;

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const methodologies = loadMethodologyDataset();

  console.log(`[seed-methodologies] validated ${methodologies.length} methodologies`);
  for (const category of METHODOLOGY_CATEGORIES) {
    const n = methodologies.filter((m) => m.category === category).length;
    console.log(`  ${category.padEnd(20)} ${n}`);
  }

  if (dryRun) {
    console.log('[seed-methodologies] --dry-run: no database changes made');
    return;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const pool = new Pool({ connectionString, max: 2 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const m of methodologies) {
      await client.query(UPSERT_SQL, [
        m.slug,
        m.code,
        m.name,
        m.category,
        m.standard,
        m.version,
        m.description,
        m.formula,
        JSON.stringify(m.parameters),
        m.applicability,
        m.sourceRef,
        m.metadataVerified,
      ]);
    }
    await client.query('COMMIT');
    console.log(`[seed-methodologies] upserted ${methodologies.length} methodologies`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
