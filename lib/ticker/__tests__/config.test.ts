import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadTickerConfig, validateTickerConfig } from '@/lib/ticker/config';

describe('lib/ticker/config', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('loadTickerConfig defaults', () => {
    it('returns defaults when no env vars set', () => {
      const cfg = loadTickerConfig();
      expect(cfg.port).toBe(3001);
      expect(cfg.host).toBe('0.0.0.0');
      expect(cfg.corsOrigin).toBe('*');
      expect(cfg.heartbeatIntervalMs).toBe(30_000);
      expect(cfg.maxConnections).toBe(1000);
      expect(cfg.enableCompression).toBe(true);
      expect(cfg.rateLimitPerSecond).toBe(50);
      expect(cfg.broadcastIntervalMs).toBe(1000);
      expect(cfg.simulateTrades).toBe(false);
      expect(cfg.simulateIntervalMs).toBe(5000);
    });

    it('reads custom values from env', () => {
      process.env.TICKER_PORT = '4000';
      process.env.TICKER_HOST = '127.0.0.1';
      process.env.TICKER_CORS_ORIGIN = 'https://app.example.com,https://api.example.com';
      process.env.TICKER_HEARTBEAT_MS = '15000';
      process.env.TICKER_MAX_CONNECTIONS = '500';
      process.env.TICKER_ENABLE_COMPRESSION = 'false';
      process.env.TICKER_RATE_LIMIT_PER_SEC = '20';
      process.env.TICKER_BROADCAST_INTERVAL_MS = '500';
      process.env.TICKER_SIMULATE_TRADES = 'true';
      process.env.TICKER_SIMULATE_INTERVAL_MS = '2000';

      const cfg = loadTickerConfig();

      expect(cfg.port).toBe(4000);
      expect(cfg.host).toBe('127.0.0.1');
      expect(cfg.corsOrigin).toEqual(['https://app.example.com', 'https://api.example.com']);
      expect(cfg.heartbeatIntervalMs).toBe(15_000);
      expect(cfg.maxConnections).toBe(500);
      expect(cfg.enableCompression).toBe(false);
      expect(cfg.rateLimitPerSecond).toBe(20);
      expect(cfg.broadcastIntervalMs).toBe(500);
      expect(cfg.simulateTrades).toBe(true);
      expect(cfg.simulateIntervalMs).toBe(2000);
    });

    it('parses single cors origin as string', () => {
      process.env.TICKER_CORS_ORIGIN = 'https://only.example.com';
      const cfg = loadTickerConfig();
      expect(cfg.corsOrigin).toBe('https://only.example.com');
    });
  });

  describe('validateTickerConfig', () => {
    it('returns empty array for valid config', () => {
      const errors = validateTickerConfig(loadTickerConfig());
      expect(errors).toEqual([]);
    });

    it('flags invalid port', () => {
      const errors = validateTickerConfig({
        ...loadTickerConfig(),
        port: 0,
      });
      expect(errors.some((e) => e.includes('TICKER_PORT'))).toBe(true);
    });

    it('flags port > 65535', () => {
      const errors = validateTickerConfig({
        ...loadTickerConfig(),
        port: 99999,
      });
      expect(errors.some((e) => e.includes('TICKER_PORT'))).toBe(true);
    });

    it('flags heartbeat too low', () => {
      const errors = validateTickerConfig({
        ...loadTickerConfig(),
        heartbeatIntervalMs: 500,
      });
      expect(errors.some((e) => e.includes('TICKER_HEARTBEAT_MS'))).toBe(true);
    });

    it('flags maxConnections too low', () => {
      const errors = validateTickerConfig({
        ...loadTickerConfig(),
        maxConnections: 0,
      });
      expect(errors.some((e) => e.includes('TICKER_MAX_CONNECTIONS'))).toBe(true);
    });

    it('flags rate limit too low', () => {
      const errors = validateTickerConfig({
        ...loadTickerConfig(),
        rateLimitPerSecond: 0,
      });
      expect(errors.some((e) => e.includes('TICKER_RATE_LIMIT_PER_SEC'))).toBe(true);
    });

    it('flags broadcast interval too low', () => {
      const errors = validateTickerConfig({
        ...loadTickerConfig(),
        broadcastIntervalMs: 10,
      });
      expect(errors.some((e) => e.includes('TICKER_BROADCAST_INTERVAL_MS'))).toBe(true);
    });

    it('flags simulate interval too low if simulate enabled', () => {
      const errors = validateTickerConfig({
        ...loadTickerConfig(),
        simulateTrades: true,
        simulateIntervalMs: 10,
      });
      expect(errors.some((e) => e.includes('TICKER_SIMULATE_INTERVAL_MS'))).toBe(true);
    });

    it('ignores simulate interval if simulate disabled', () => {
      const errors = validateTickerConfig({
        ...loadTickerConfig(),
        simulateTrades: false,
        simulateIntervalMs: 10,
      });
      expect(errors.some((e) => e.includes('TICKER_SIMULATE_INTERVAL_MS'))).toBe(false);
    });
  });
});
