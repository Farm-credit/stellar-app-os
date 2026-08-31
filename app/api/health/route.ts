/**
 * Health check endpoint for Docker containers and load balancers.
 * Issue #1182: Container health checks
 *
 * Returns basic status info. In production, also verifies database
 * and Redis connectivity.
 */

import { NextResponse } from 'next/server';

interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  version: string;
  uptime: number;
  services?: {
    database?: 'ok' | 'error';
    redis?: 'ok' | 'error';
  };
}

export async function GET(): Promise<NextResponse<HealthStatus>> {
  const status: HealthStatus = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.0',
    uptime: process.uptime(),
  };

  // In production, verify database and Redis connectivity
  if (process.env.NODE_ENV === 'production') {
    status.services = {};

    try {
      const { getPool } = await import('@/lib/db/client');
      const pool = getPool();
      await pool.query('SELECT 1');
      status.services.database = 'ok';
    } catch {
      status.services.database = 'error';
      status.status = 'degraded';
    }

    try {
      const { default: Redis } = await import('redis');
      const client = Redis.createClient({ url: process.env.REDIS_URL });
      await client.connect();
      await client.ping();
      await client.disconnect();
      status.services.redis = 'ok';
    } catch {
      status.services.redis = 'error';
      status.status = 'degraded';
    }
  }

  const httpStatus = status.status === 'error' ? 503 : 200;
  return NextResponse.json(status, { status: httpStatus });
}
