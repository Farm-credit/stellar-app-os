import { Pool } from 'pg';

/**
 * Read-replica connection management for analytics / read-only queries.
 *
 * Heavy analytics queries are routed to dedicated read replicas so they never
 * block production writes on the primary database. When no replica is
 * configured (e.g. local development) reads transparently fall back to the
 * primary connection.
 *
 * Configuration (in priority order):
 *   1. `DATABASE_READ_REPLICA_URLS` — comma-separated list of replica URLs.
 *   2. `DATABASE_URL_READ_REPLICA`  — single replica URL (legacy).
 *   3. `DATABASE_URL`               — primary, used as a fallback.
 */

const REPLICA_POOL_MAX = 5;
const IDLE_TIMEOUT_MS = 30_000;
const CONNECTION_TIMEOUT_MS = 5_000;

let replicaPools: Pool[] = [];
let primaryPool: Pool | null = null;
let roundRobinIndex = 0;

function poolOptions(connectionString: string) {
  return {
    connectionString,
    max: REPLICA_POOL_MAX,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  };
}

function createPool(connectionString: string): Pool {
  const pool = new Pool(poolOptions(connectionString));
  pool.on('error', (err) => {
    console.error('[db] unexpected read-replica pool error', err);
  });
  return pool;
}

/**
 * Parse the configured read-replica connection strings.
 * Returns an empty array when no replica is configured.
 */
export function getReplicaUrls(): string[] {
  const raw = process.env.DATABASE_READ_REPLICA_URLS;
  if (raw) {
    const urls = raw
      .split(',')
      .map((url) => url.trim())
      .filter((url) => url.length > 0);
    if (urls.length > 0) {
      return urls;
    }
  }

  const single = process.env.DATABASE_URL_READ_REPLICA;
  if (single && single.trim().length > 0) {
    return [single.trim()];
  }

  return [];
}

function getReplicaPools(): Pool[] {
  if (replicaPools.length === 0) {
    replicaPools = getReplicaUrls().map(createPool);
  }
  return replicaPools;
}

/**
 * Get the primary pool. Used for writes and as a fallback when no replica is
 * available.
 */
export function getPrimaryPool(): Pool {
  if (!primaryPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    primaryPool = createPool(connectionString);
  }
  return primaryPool;
}

/**
 * Get a pool suitable for read-only / analytics queries.
 *
 * Replicas are selected round-robin to spread analytics load. If no replica is
 * configured the primary pool is returned so callers always get a usable pool.
 */
export function getReadPool(): Pool {
  const pools = getReplicaPools();
  if (pools.length === 0) {
    return getPrimaryPool();
  }
  const pool = pools[roundRobinIndex % pools.length];
  roundRobinIndex = (roundRobinIndex + 1) % pools.length;
  return pool;
}

/**
 * Execute a read-only query against a replica (falling back to the primary
 * when no replica is configured).
 */
export async function queryRead<T = any>(
  text: string,
  params?: any[]
): Promise<import('pg').QueryResult<T>> {
  return getReadPool().query<T>(text, params);
}

/**
 * Close all pools and reset cached state. Intended for graceful shutdown and
 * for isolating tests.
 */
export async function closeReadPools(): Promise<void> {
  const pools = replicaPools;
  replicaPools = [];
  roundRobinIndex = 0;

  await Promise.all(pools.map((pool) => pool.end()));

  if (primaryPool) {
    await primaryPool.end();
    primaryPool = null;
  }
}

/**
 * Reset cached pools without closing them. Test-only helper.
 */
export function resetReadPools(): void {
  replicaPools = [];
  primaryPool = null;
  roundRobinIndex = 0;
}
