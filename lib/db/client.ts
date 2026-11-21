import { Pool, types } from 'pg';

// Parse BIGINT (oid 20) as a plain JavaScript number rather than a string.
// All ids used in this app fit comfortably within Number.MAX_SAFE_INTEGER,
// and downstream code (route handlers, tests) expects numeric ids.  This
// must run before any Pool is constructed.
types.setTypeParser(20, (value: string) => Number.parseInt(value, 10));

// Singleton pool — reused across Next.js API routes and the indexer worker.
// Reads DATABASE_URL from the environment (postgres://user:pass@host:5432/db).
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    pool.on('error', (err) => {
      console.error('[db] unexpected pool error', err);
    });
  }
  return pool;
}
