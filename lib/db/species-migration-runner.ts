import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getPool } from './client';

export interface MigrationResult {
  appliedCount: number;
  speciesSeededCount: number;
  appliedFiles: string[];
  alreadyAppliedFiles: string[];
}

export interface SpeciesCatalogSeed {
  species_slug: string;
  name: string;
  scientific_name: string;
  co2_kg_per_year: number;
  native_regions: string[];
  description: string;
}

export const DEFAULT_SPECIES_CATALOG: SpeciesCatalogSeed[] = [
  {
    species_slug: 'acacia-senegal',
    name: 'Gum Arabic Tree',
    scientific_name: 'Senegalia senegal',
    co2_kg_per_year: 25.5,
    native_regions: ['Sub-Saharan Africa', 'Sahel'],
    description: 'Drought-resistant leguminous tree fixing nitrogen and sequestering carbon in arid soils.',
  },
  {
    species_slug: 'khaya-senegalensis',
    name: 'African Mahogany',
    scientific_name: 'Khaya senegalensis',
    co2_kg_per_year: 38.0,
    native_regions: ['West Africa', 'Central Africa'],
    description: 'Fast-growing hardwood tree high in biomass carbon density.',
  },
  {
    species_slug: 'mangifera-indica',
    name: 'Mango Tree',
    scientific_name: 'Mangifera indica',
    co2_kg_per_year: 30.0,
    native_regions: ['Tropical Regions', 'West Africa'],
    description: 'Evergreen fruit tree supporting community food security and soil carbon retention.',
  },
  {
    species_slug: 'rhizophora-mangle',
    name: 'Red Mangrove',
    scientific_name: 'Rhizophora mangle',
    co2_kg_per_year: 45.2,
    native_regions: ['Coastal Tropics', 'West African Coast'],
    description: 'Blue carbon power plant sequestering up to 4x carbon compared to terrestrial forests.',
  },
];

/**
 * Calculates SHA256 checksum for migration verification.
 */
export function calculateChecksum(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Automatically ensures migration table exists, runs pending schema migrations,
 * and seeds default tree species catalog on server start.
 */
export async function runSpeciesCatalogMigrations(
  migrationsDir: string = path.join(process.cwd(), 'db', 'migrations')
): Promise<MigrationResult> {
  const pool = getPool();
  const client = await pool.connect();

  const appliedFiles: string[] = [];
  const alreadyAppliedFiles: string[] = [];
  let speciesSeededCount = 0;

  try {
    await client.query('BEGIN');

    // 1. Ensure migrations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        checksum VARCHAR(64) NOT NULL,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Read existing migrations
    const res = await client.query('SELECT filename FROM schema_migrations');
    const appliedSet = new Set<string>(res.rows.map((r: { filename: string }) => r.filename));

    // 3. Find migration files
    if (fs.existsSync(migrationsDir)) {
      const files = fs
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith('.sql') && !f.includes('rollback'))
        .sort();

      for (const file of files) {
        if (appliedSet.has(file)) {
          alreadyAppliedFiles.push(file);
          continue;
        }

        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf8');
        const checksum = calculateChecksum(sql);

        console.log(`[db:migration] Running migration: ${file}`);
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)',
          [file, checksum]
        );
        appliedFiles.push(file);
      }
    }

    // 4. Seed Species Catalog if species_catalogue table exists
    const checkTable = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'species_catalogue'
      );
    `);

    if (checkTable.rows[0]?.exists) {
      for (const species of DEFAULT_SPECIES_CATALOG) {
        const insertRes = await client.query(
          `
          INSERT INTO species_catalogue (
            species_slug, name, scientific_name, co2_kg_per_year, native_regions, description
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (species_slug) DO UPDATE
          SET co2_kg_per_year = EXCLUDED.co2_kg_per_year,
              updated_at = NOW()
          RETURNING id;
        `,
          [
            species.species_slug,
            species.name,
            species.scientific_name,
            species.co2_kg_per_year,
            JSON.stringify(species.native_regions),
            species.description,
          ]
        );
        if (insertRes.rowCount && insertRes.rowCount > 0) {
          speciesSeededCount++;
        }
      }
    }

    await client.query('COMMIT');
    console.log(
      `[db:migration] Species Catalog migrations completed. Applied: ${appliedFiles.length}, Seeded: ${speciesSeededCount}`
    );

    return {
      appliedCount: appliedFiles.length,
      speciesSeededCount,
      appliedFiles,
      alreadyAppliedFiles,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[db:migration] Migration failed, transaction rolled back:', err);
    throw err;
  } finally {
    client.release();
  }
}
