import { Pool } from 'pg';

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
