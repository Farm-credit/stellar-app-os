import { Pool, PoolConfig, QueryResult } from 'pg';

/**
 * Database instance configuration for primary or replica
 */
export interface DatabaseInstance {
  name: string;
  url: string;
  region: string;
  isPrimary: boolean;
  priority: number; // Lower number = higher priority
}

/**
 * Health check result for a database instance
 */
export interface HealthCheckResult {
  instanceName: string;
  isHealthy: boolean;
  latencyMs: number;
  error?: string;
  checkedAt: Date;
}

/**
 * Query balancer configuration
 */
export interface ReplicaBalancerConfig {
  primary: DatabaseInstance;
  replicas: DatabaseInstance[];
  healthCheckInterval?: number; // milliseconds
  healthCheckTimeout?: number; // milliseconds
  maxRetries?: number;
  retryDelay?: number; // milliseconds
}

/**
 * Query options for routing
 */
export interface QueryOptions {
  forcePrimary?: boolean; // Force query to primary
  preferredRegion?: string; // Prefer specific region
  allowFallback?: boolean; // Allow fallback to primary if replicas fail
}

/**
 * Multi-Region PostgreSQL Read-Replica Query Balancer
 * Routes read queries to nearest healthy read-replica instances
 */
export class ReplicaBalancer {
  private primaryPool: Pool;
  private replicaPools: Map<string, Pool>;
  private healthStatus: Map<string, HealthCheckResult>;
  private config: Required<ReplicaBalancerConfig>;
  private healthCheckTimer?: ReturnType<typeof setInterval>;

  constructor(config: ReplicaBalancerConfig) {
    this.config = {
      healthCheckInterval: config.healthCheckInterval ?? 30_000, // 30 seconds
      healthCheckTimeout: config.healthCheckTimeout ?? 5_000, // 5 seconds
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 100, // 100ms
      primary: config.primary,
      replicas: config.replicas,
    };

    this.replicaPools = new Map();
    this.healthStatus = new Map();

    // Initialize primary pool
    this.primaryPool = this.createPool(this.config.primary);

    // Initialize replica pools
    for (const replica of this.config.replicas) {
      this.replicaPools.set(replica.name, this.createPool(replica));
    }

    // Start health checks
    this.startHealthChecks();
  }

  /**
   * Create a connection pool for a database instance
   */
  private createPool(instance: DatabaseInstance): Pool {
    const poolConfig: PoolConfig = {
      connectionString: instance.url,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    };

    const pool = new Pool(poolConfig);

    pool.on('error', (err: Error) => {
      console.error(`[db][${instance.name}] pool error`, err);
      this.markUnhealthy(instance.name, err.message);
    });

    return pool;
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthChecks();
    }, this.config.healthCheckInterval);

    // Initial health check
    this.performHealthChecks();
  }

  /**
   * Perform health checks on all instances
   */
  private async performHealthChecks(): Promise<void> {
    const checks = [
      this.checkInstance(this.config.primary, this.primaryPool),
      ...this.config.replicas.map((replica) =>
        this.checkInstance(replica, this.replicaPools.get(replica.name)!)
      ),
    ];

    await Promise.allSettled(checks);
  }

  /**
   * Check health of a specific instance
   */
  private async checkInstance(
    instance: DatabaseInstance,
    pool: Pool
  ): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      const client = await pool.connect();
      try {
        await client.query('SELECT 1');
        const latency = Date.now() - startTime;

        const result: HealthCheckResult = {
          instanceName: instance.name,
          isHealthy: true,
          latencyMs: latency,
          checkedAt: new Date(),
        };

        this.healthStatus.set(instance.name, result);
        return result;
      } finally {
        client.release();
      }
    } catch (error) {
      const latency = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      const result: HealthCheckResult = {
        instanceName: instance.name,
        isHealthy: false,
        latencyMs: latency,
        error: errorMessage,
        checkedAt: new Date(),
      };

      this.healthStatus.set(instance.name, result);
      console.error(`[db][${instance.name}] health check failed`, errorMessage);
      return result;
    }
  }

  /**
   * Mark an instance as unhealthy
   */
  private markUnhealthy(instanceName: string, error: string): void {
    this.healthStatus.set(instanceName, {
      instanceName,
      isHealthy: false,
      latencyMs: 0,
      error,
      checkedAt: new Date(),
    });
  }

  /**
   * Get the best available pool for a read query
   */
  private getBestPool(options: QueryOptions = {}): Pool {
    // Force primary if requested
    if (options.forcePrimary) {
      return this.primaryPool;
    }

    // Filter healthy replicas
    const healthyReplicas = this.config.replicas.filter((replica) => {
      const status = this.healthStatus.get(replica.name);
      return status?.isHealthy ?? false;
    });

    // If no healthy replicas, return primary
    if (healthyReplicas.length === 0) {
      console.warn('[db] No healthy replicas available, using primary');
      return this.primaryPool;
    }

    // Sort by preferred region, then priority, then latency
    const sorted = [...healthyReplicas].sort((a, b) => {
      // Preferred region first
      if (options.preferredRegion) {
        if (a.region === options.preferredRegion && b.region !== options.preferredRegion) {
          return -1;
        }
        if (b.region === options.preferredRegion && a.region !== options.preferredRegion) {
          return 1;
        }
      }

      // Lower priority first
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }

      // Lower latency first
      const aLatency = this.healthStatus.get(a.name)?.latencyMs ?? Infinity;
      const bLatency = this.healthStatus.get(b.name)?.latencyMs ?? Infinity;
      return aLatency - bLatency;
    });

    const selected = sorted[0];
    return this.replicaPools.get(selected.name)!;
  }

  /**
   * Execute a query with automatic routing
   */
  async query<T = any>(
    text: string,
    params?: any[],
    options: QueryOptions = {}
  ): Promise<QueryResult<T>> {
    const pool = this.getBestPool(options);
    
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        return await pool.query<T>(text, params);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        console.error(
          `[db] Query attempt ${attempt + 1}/${this.config.maxRetries} failed`,
          lastError.message
        );

        // If not the last attempt, wait before retry
        if (attempt < this.config.maxRetries - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.config.retryDelay)
          );
        }
      }
    }

    // All retries failed, try primary as fallback if allowed
    if (options.allowFallback && pool !== this.primaryPool) {
      console.warn('[db] Retrying on primary after replica failures');
      try {
        return await this.primaryPool.query<T>(text, params);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw lastError || new Error('Query failed after all retries');
  }

  /**
   * Execute a write query (always goes to primary)
   */
  async write<T = any>(
    text: string,
    params?: any[]
  ): Promise<QueryResult<T>> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        return await this.primaryPool.query<T>(text, params);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        console.error(
          `[db] Write attempt ${attempt + 1}/${this.config.maxRetries} failed`,
          lastError.message
        );

        if (attempt < this.config.maxRetries - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.config.retryDelay)
          );
        }
      }
    }

    throw lastError || new Error('Write query failed after all retries');
  }

  /**
   * Get current health status of all instances
   */
  getHealthStatus(): HealthCheckResult[] {
    return Array.from(this.healthStatus.values());
  }

  /**
   * Get a specific pool by instance name
   */
  getPool(instanceName: string): Pool | undefined {
    if (instanceName === this.config.primary.name) {
      return this.primaryPool;
    }
    return this.replicaPools.get(instanceName);
  }

  /**
   * Close all connection pools
   */
  async close(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    await this.primaryPool.end();
    
    for (const pool of this.replicaPools.values()) {
      await pool.end();
    }

    this.replicaPools.clear();
    this.healthStatus.clear();
  }
}

// Singleton instance
let balancer: ReplicaBalancer | null = null;

/**
 * Get or create the singleton replica balancer instance
 */
export function getReplicaBalancer(): ReplicaBalancer {
  if (!balancer) {
    const config: ReplicaBalancerConfig = {
      primary: {
        name: 'primary',
        url: process.env.DATABASE_URL || '',
        region: process.env.DATABASE_PRIMARY_REGION || 'us-east-1',
        isPrimary: true,
        priority: 0,
      },
      replicas: parseReplicaConfig(),
    };

    balancer = new ReplicaBalancer(config);
  }

  return balancer;
}

/**
 * Parse replica configuration from environment variables
 * Expected format: DATABASE_REPLICA_0_URL, DATABASE_REPLICA_0_REGION, DATABASE_REPLICA_0_PRIORITY
 */
function parseReplicaConfig(): DatabaseInstance[] {
  const replicas: DatabaseInstance[] = [];
  let index = 0;

  while (true) {
    const url = process.env[`DATABASE_REPLICA_${index}_URL`];
    const region = process.env[`DATABASE_REPLICA_${index}_REGION`] || 'us-east-1';
    const priority = parseInt(
      process.env[`DATABASE_REPLICA_${index}_Priority`] || '10',
      10
    );

    if (!url) {
      break;
    }

    replicas.push({
      name: `replica-${index}`,
      url,
      region,
      isPrimary: false,
      priority,
    });

    index++;
  }

  return replicas;
}

/**
 * Execute a read query using the replica balancer
 */
export async function query<T = any>(
  text: string,
  params?: any[],
  options?: QueryOptions
): Promise<QueryResult<T>> {
  const balancer = getReplicaBalancer();
  return balancer.query<T>(text, params, options);
}

/**
 * Execute a write query using the replica balancer
 */
export async function write<T = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const balancer = getReplicaBalancer();
  return balancer.write<T>(text, params);
}
