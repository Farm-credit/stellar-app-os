#!/usr/bin/env node

/**
 * Automated Database Migration Runner
 * 
 * This script automatically runs pending database migrations in order.
 * It tracks applied migrations in the schema_migrations table to prevent
 * re-running the same migration.
 * 
 * Usage:
 *   node scripts/run-migrations.mjs
 * 
 * Environment variables:
 *   DATABASE_URL - PostgreSQL connection string (required)
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations');

// Verify migrations directory exists
if (!fs.existsSync(MIGRATIONS_DIR)) {
  error(`Migrations directory not found: ${MIGRATIONS_DIR}`);
  process.exit(1);
}

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function error(message) {
  log(`ERROR: ${message}`, colors.red);
}

function success(message) {
  log(`✓ ${message}`, colors.green);
}

function info(message) {
  log(`ℹ ${message}`, colors.cyan);
}

function warn(message) {
  log(`⚠ ${message}`, colors.yellow);
}

/**
 * Calculate SHA256 checksum of a file
 */
function calculateChecksum(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch (err) {
    error(`Failed to read file ${filePath}: ${err.message}`);
    throw err;
  }
}

/**
 * Get all migration files sorted by name
 */
function getMigrationFiles() {
  try {
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(file => file.endsWith('.sql'))
      .filter(file => !file.includes('rollback')) // Skip rollback files
      .sort();
    
    return files;
  } catch (err) {
    error(`Failed to read migrations directory: ${err.message}`);
    throw err;
  }
}

/**
 * Check if schema_migrations table exists, create it if not
 */
async function ensureSchemaMigrationsTable(client) {
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        migration_name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        checksum TEXT NOT NULL,
        execution_time_ms INTEGER
      );
      
      CREATE INDEX IF NOT EXISTS idx_sm_applied_at ON schema_migrations (applied_at DESC);
    `);
    success('Schema migrations table verified');
  } catch (err) {
    error(`Failed to create schema_migrations table: ${err.message}`);
    throw err;
  }
}

/**
 * Get list of already applied migrations
 */
async function getAppliedMigrations(client) {
  try {
    const result = await client.query('SELECT migration_name, checksum FROM schema_migrations ORDER BY migration_name');
    return new Map(result.rows.map(row => [row.migration_name, row.checksum]));
  } catch (err) {
    // If table doesn't exist yet, return empty map
    if (err.code === '42P01') { // undefined_table
      return new Map();
    }
    throw err;
  }
}

/**
 * Apply a single migration
 */
async function applyMigration(client, migrationFile) {
  const filePath = path.join(MIGRATIONS_DIR, migrationFile);
  const checksum = calculateChecksum(filePath);
  const migrationSQL = fs.readFileSync(filePath, 'utf8');
  
  log(`Applying: ${migrationFile}`, colors.blue);
  
  const startTime = Date.now();
  
  try {
    await client.query('BEGIN');
    
    // Execute the migration
    await client.query(migrationSQL);
    
    // Record the migration
    const executionTime = Date.now() - startTime;
    await client.query(
      'INSERT INTO schema_migrations (migration_name, checksum, execution_time_ms) VALUES ($1, $2, $3)',
      [migrationFile, checksum, executionTime]
    );
    
    await client.query('COMMIT');
    
    success(`${migrationFile} (${executionTime}ms)`);
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    error(`Failed to apply ${migrationFile}: ${err.message}`);
    return false;
  }
}

/**
 * Verify migration checksum
 */
async function verifyMigrationChecksum(client, migrationFile, currentChecksum) {
  const result = await client.query(
    'SELECT checksum FROM schema_migrations WHERE migration_name = $1',
    [migrationFile]
  );
  
  if (result.rows.length === 0) {
    return null; // Not applied yet
  }
  
  const storedChecksum = result.rows[0].checksum;
  return storedChecksum === currentChecksum;
}

/**
 * Validate migration files without connecting to database
 */
function validateMigrations() {
  const migrationFiles = getMigrationFiles();
  
  log('\n=== Validating Migration Files ===', colors.blue);
  info(`Found ${migrationFiles.length} migration files`);
  
  let valid = true;
  for (const file of migrationFiles) {
    const filePath = path.join(MIGRATIONS_DIR, file);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const checksum = calculateChecksum(filePath);
      success(`${file} (${checksum.substring(0, 8)}...)`);
    } catch (err) {
      error(`${file}: ${err.message}`);
      valid = false;
    }
  }
  
  if (valid) {
    success('All migration files are valid');
  } else {
    error('Some migration files are invalid');
    process.exit(1);
  }
}

/**
 * Show migration status
 */
async function showStatus() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    error('DATABASE_URL environment variable is not set');
    process.exit(1);
  }
  
  const client = new Client({ connectionString: databaseUrl });
  
  try {
    await client.connect();
    success('Connected to database');
    
    // Get migration files
    const migrationFiles = getMigrationFiles();
    info(`Found ${migrationFiles.length} migration files`);
    
    // Get applied migrations
    const appliedMigrations = await getAppliedMigrations(client);
    
    log('\n=== Migration Status ===', colors.blue);
    
    for (const file of migrationFiles) {
      const filePath = path.join(MIGRATIONS_DIR, file);
      const currentChecksum = calculateChecksum(filePath);
      
      if (appliedMigrations.has(file)) {
        const storedChecksum = appliedMigrations.get(file);
        if (storedChecksum === currentChecksum) {
          success(`${file} (applied)`);
        } else {
          error(`${file} (checksum mismatch!)`);
        }
      } else {
        log(`${file} (pending)`, colors.yellow);
      }
    }
    
    await client.end();
  } catch (err) {
    error(`Failed to show status: ${err.message}`);
    await client.end();
    process.exit(1);
  }
}

/**
 * Main migration runner
 */
async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    error('DATABASE_URL environment variable is not set');
    process.exit(1);
  }
  
  const client = new Client({ connectionString: databaseUrl });
  
  try {
    await client.connect();
    success('Connected to database');
    
    // Ensure schema_migrations table exists
    await ensureSchemaMigrationsTable(client);
    
    // Get migration files
    const migrationFiles = getMigrationFiles();
    info(`Found ${migrationFiles.length} migration files`);
    
    if (migrationFiles.length === 0) {
      warn('No migration files found');
      await client.end();
      return;
    }
    
    // Get applied migrations
    const appliedMigrations = await getAppliedMigrations(client);
    info(`Already applied: ${appliedMigrations.size} migrations`);
    
    // Determine pending migrations
    const pendingMigrations = [];
    const checksumMismatches = [];
    
    for (const file of migrationFiles) {
      const currentChecksum = calculateChecksum(path.join(MIGRATIONS_DIR, file));
      
      if (appliedMigrations.has(file)) {
        // Verify checksum
        const storedChecksum = appliedMigrations.get(file);
        if (storedChecksum !== currentChecksum) {
          checksumMismatches.push({ file, storedChecksum, currentChecksum });
        }
      } else {
        pendingMigrations.push(file);
      }
    }
    
    // Report checksum mismatches
    if (checksumMismatches.length > 0) {
      error('Checksum mismatches detected (migration files have been modified after being applied):');
      for (const { file, storedChecksum, currentChecksum } of checksumMismatches) {
        log(`  - ${file}`, colors.red);
        log(`    Stored: ${storedChecksum}`, colors.red);
        log(`    Current: ${currentChecksum}`, colors.red);
      }
      error('For safety, migrations will not run. Please resolve checksum mismatches manually.');
      await client.end();
      process.exit(1);
    }
    
    // Report pending migrations
    if (pendingMigrations.length === 0) {
      success('All migrations are up to date');
      await client.end();
      return;
    }
    
    info(`Pending migrations: ${pendingMigrations.length}`);
    for (const file of pendingMigrations) {
      log(`  - ${file}`, colors.yellow);
    }
    
    // Apply pending migrations
    log('\nApplying migrations...', colors.blue);
    let successCount = 0;
    let failureCount = 0;
    
    for (const file of pendingMigrations) {
      const result = await applyMigration(client, file);
      if (result) {
        successCount++;
      } else {
        failureCount++;
        break; // Stop on first failure
      }
    }
    
    // Summary
    log('\n=== Migration Summary ===', colors.blue);
    log(`Applied: ${successCount}`, colors.green);
    if (failureCount > 0) {
      log(`Failed: ${failureCount}`, colors.red);
      await client.end();
      process.exit(1);
    }
    
    success('Migration completed successfully');
    
    await client.end();
  } catch (err) {
    error(`Migration failed: ${err.message}`);
    await client.end();
    process.exit(1);
  }
}

// Run the migration or show status based on command line args
const command = process.argv[2];

if (command === 'status') {
  showStatus();
} else if (command === 'validate') {
  validateMigrations();
} else {
  main();
}
