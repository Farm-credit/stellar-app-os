import logger from '@/lib/logger';

export interface TickerServerConfig {
  port: number;
  host: string;
  corsOrigin: string | string[];
  heartbeatIntervalMs: number;
  maxConnections: number;
  enableCompression: boolean;
  rateLimitPerSecond: number;
  broadcastIntervalMs: number;
  simulateTrades: boolean;
  simulateIntervalMs: number;
}

export function loadTickerConfig(): TickerServerConfig {
  const port = Number(process.env.TICKER_PORT) || 3001;
  const host = process.env.TICKER_HOST || '0.0.0.0';
  const corsOriginRaw = process.env.TICKER_CORS_ORIGIN || '*';
  const corsOrigin = corsOriginRaw.includes(',')
    ? corsOriginRaw.split(',').map((s) => s.trim())
    : corsOriginRaw;

  const config: TickerServerConfig = {
    port,
    host,
    corsOrigin,
    heartbeatIntervalMs: Number(process.env.TICKER_HEARTBEAT_MS) || 30_000,
    maxConnections: Number(process.env.TICKER_MAX_CONNECTIONS) || 1000,
    enableCompression: (process.env.TICKER_ENABLE_COMPRESSION || 'true') === 'true',
    rateLimitPerSecond: Number(process.env.TICKER_RATE_LIMIT_PER_SEC) || 50,
    broadcastIntervalMs: Number(process.env.TICKER_BROADCAST_INTERVAL_MS) || 1000,
    simulateTrades: (process.env.TICKER_SIMULATE_TRADES || 'false') === 'true',
    simulateIntervalMs: Number(process.env.TICKER_SIMULATE_INTERVAL_MS) || 5000,
  };

  logger.info('ticker config loaded', {
    port: config.port,
    host: config.host,
    heartbeatIntervalMs: config.heartbeatIntervalMs,
    maxConnections: config.maxConnections,
    enableCompression: config.enableCompression,
    rateLimitPerSecond: config.rateLimitPerSecond,
    broadcastIntervalMs: config.broadcastIntervalMs,
    simulateTrades: config.simulateTrades,
    simulateIntervalMs: config.simulateIntervalMs,
  });

  return config;
}

export function validateTickerConfig(config: TickerServerConfig): string[] {
  const errors: string[] = [];

  if (config.port < 1 || config.port > 65535) {
    errors.push(`TICKER_PORT must be between 1 and 65535, got ${config.port}`);
  }

  if (config.heartbeatIntervalMs < 1000) {
    errors.push(`TICKER_HEARTBEAT_MS must be >= 1000ms, got ${config.heartbeatIntervalMs}ms`);
  }

  if (config.maxConnections < 1) {
    errors.push(`TICKER_MAX_CONNECTIONS must be >= 1, got ${config.maxConnections}`);
  }

  if (config.rateLimitPerSecond < 1) {
    errors.push(`TICKER_RATE_LIMIT_PER_SEC must be >= 1, got ${config.rateLimitPerSecond}`);
  }

  if (config.broadcastIntervalMs < 100) {
    errors.push(
      `TICKER_BROADCAST_INTERVAL_MS must be >= 100ms, got ${config.broadcastIntervalMs}ms`
    );
  }

  if (config.simulateTrades && config.simulateIntervalMs < 100) {
    errors.push(`TICKER_SIMULATE_INTERVAL_MS must be >= 100ms, got ${config.simulateIntervalMs}ms`);
  }

  return errors;
}
