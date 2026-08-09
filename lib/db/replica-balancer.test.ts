import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReplicaBalancer, DatabaseInstance, type ReplicaBalancerConfig } from './replica-balancer';

// Mock pg module
vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => ({
    connect: vi.fn(),
    query: vi.fn(),
    on: vi.fn(),
    end: vi.fn(),
  })),
}));

import { Pool } from 'pg';

describe('ReplicaBalancer', () => {
  let mockPrimaryPool: any;
  let mockReplicaPool: any;
  let config: ReplicaBalancerConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPrimaryPool = {
      connect: vi.fn().mockResolvedValue({
        query: vi.fn().mockResolvedValue({ rows: [{ result: 1 }] }),
        release: vi.fn(),
      }),
      query: vi.fn().mockResolvedValue({ rows: [] }),
      on: vi.fn(),
      end: vi.fn().mockResolvedValue(undefined),
    };

    mockReplicaPool = {
      connect: vi.fn().mockResolvedValue({
        query: vi.fn().mockResolvedValue({ rows: [{ result: 1 }] }),
        release: vi.fn(),
      }),
      query: vi.fn().mockResolvedValue({ rows: [] }),
      on: vi.fn(),
      end: vi.fn().mockResolvedValue(undefined),
    };

    config = {
      primary: {
        name: 'primary',
        url: 'postgres://primary:5432/db',
        region: 'us-east-1',
        isPrimary: true,
        priority: 0,
      },
      replicas: [
        {
          name: 'replica-0',
          url: 'postgres://replica-0:5432/db',
          region: 'us-west-2',
          isPrimary: false,
          priority: 10,
        },
        {
          name: 'replica-1',
          url: 'postgres://replica-1:5432/db',
          region: 'eu-west-1',
          isPrimary: false,
          priority: 20,
        },
      ],
      healthCheckInterval: 1000,
      healthCheckTimeout: 5000,
      maxRetries: 3,
      retryDelay: 10,
    };

    vi.mocked(Pool).mockImplementation((poolConfig: any) => {
      if (poolConfig.connectionString === config.primary.url) {
        return mockPrimaryPool;
      }
      return mockReplicaPool;
    });
  });

  afterEach(async () => {
    const balancer = (global as any).__testBalancer;
    if (balancer) {
      await balancer.close();
      delete (global as any).__testBalancer;
    }
  });

  describe('constructor', () => {
    it('should initialize with primary and replica pools', () => {
      const balancer = new ReplicaBalancer(config);
      (global as any).__testBalancer = balancer;

      expect(Pool).toHaveBeenCalledTimes(3);
    });

    it('should set default config values', () => {
      const minimalConfig: ReplicaBalancerConfig = {
        primary: config.primary,
        replicas: config.replicas,
      };

      const balancer = new ReplicaBalancer(minimalConfig);
      (global as any).__testBalancer = balancer;

      expect(balancer).toBeDefined();
    });
  });

  describe('health checks', () => {
    it('should perform health checks on all instances', async () => {
      const balancer = new ReplicaBalancer(config);
      (global as any).__testBalancer = balancer;

      await new Promise((resolve) => setTimeout(resolve, 100));

      const status = balancer.getHealthStatus();
      expect(status.length).toBeGreaterThan(0);
    });

    it('should mark unhealthy instances correctly', async () => {
      mockReplicaPool.connect.mockRejectedValue(new Error('Connection failed'));

      const balancer = new ReplicaBalancer(config);
      (global as any).__testBalancer = balancer;

      await new Promise((resolve) => setTimeout(resolve, 100));

      const status = balancer.getHealthStatus();
      const replicaStatus = status.find((s) => s.instanceName === 'replica-0');
      expect(replicaStatus?.isHealthy).toBe(false);
    });
  });

  describe('query routing', () => {
    it('should route read queries to healthy replicas', async () => {
      const balancer = new ReplicaBalancer(config);
      (global as any).__testBalancer = balancer;

      await new Promise((resolve) => setTimeout(resolve, 100));

      await balancer.query('SELECT * FROM test');

      expect(mockReplicaPool.query).toHaveBeenCalled();
    });

    it('should force queries to primary when requested', async () => {
      const balancer = new ReplicaBalancer(config);
      (global as any).__testBalancer = balancer;

      await balancer.query('SELECT * FROM test', [], { forcePrimary: true });

      expect(mockPrimaryPool.query).toHaveBeenCalled();
      expect(mockReplicaPool.query).not.toHaveBeenCalled();
    });

    it('should prefer replicas in specified region', async () => {
      const balancer = new ReplicaBalancer(config);
      (global as any).__testBalancer = balancer;

      await balancer.query('SELECT * FROM test', [], { preferredRegion: 'eu-west-1' });

      expect(mockReplicaPool.query).toHaveBeenCalled();
    });

    it('should fallback to primary when no healthy replicas', async () => {
      mockReplicaPool.connect.mockRejectedValue(new Error('Failed'));

      const balancer = new ReplicaBalancer(config);
      (global as any).__testBalancer = balancer;

      await new Promise((resolve) => setTimeout(resolve, 100));

      await balancer.query('SELECT * FROM test', [], { allowFallback: true });

      expect(mockPrimaryPool.query).toHaveBeenCalled();
    });

    it('should retry failed queries', async () => {
      mockReplicaPool.query
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValueOnce({ rows: [] });

      const balancer = new ReplicaBalancer(config);
      (global as any).__testBalancer = balancer;

      await balancer.query('SELECT * FROM test');

      expect(mockReplicaPool.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('write queries', () => {
    it('should always route writes to primary', async () => {
      const balancer = new ReplicaBalancer(config);
      (global as any).__testBalancer = balancer;

      await balancer.write('INSERT INTO test VALUES (1)');

      expect(mockPrimaryPool.query).toHaveBeenCalled();
      expect(mockReplicaPool.query).not.toHaveBeenCalled();
    });

    it('should retry failed writes', async () => {
      mockPrimaryPool.query
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValueOnce({ rows: [] });

      const balancer = new ReplicaBalancer(config);
      (global as any).__testBalancer = balancer;

      await balancer.write('INSERT INTO test VALUES (1)');

      expect(mockPrimaryPool.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('pool management', () => {
    it('should return specific pool by name', () => {
      const balancer = new ReplicaBalancer(config);
      (global as any).__testBalancer = balancer;

      const primaryPool = balancer.getPool('primary');
      const replicaPool = balancer.getPool('replica-0');

      expect(primaryPool).toBeDefined();
      expect(replicaPool).toBeDefined();
    });

    it('should return undefined for unknown pool', () => {
      const balancer = new ReplicaBalancer(config);
      (global as any).__testBalancer = balancer;

      const unknownPool = balancer.getPool('unknown');
      expect(unknownPool).toBeUndefined();
    });

    it('should close all pools on shutdown', async () => {
      const balancer = new ReplicaBalancer(config);
      (global as any).__testBalancer = balancer;

      await balancer.close();

      expect(mockPrimaryPool.end).toHaveBeenCalled();
      expect(mockReplicaPool.end).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should throw error after max retries', async () => {
      mockReplicaPool.query.mockRejectedValue(new Error('Persistent error'));

      const balancer = new ReplicaBalancer(config);
      (global as any).__testBalancer = balancer;

      await expect(balancer.query('SELECT * FROM test')).rejects.toThrow();
    });

    it('should log pool errors', () => {
      const consoleSpy = vi.spyOn(console, 'error');

      const balancer = new ReplicaBalancer(config);
      (global as any).__testBalancer = balancer;

      const poolErrorCallback = mockReplicaPool.on.mock.calls.find(
        (call: any) => call[0] === 'error'
      );
      if (poolErrorCallback) {
        poolErrorCallback[1](new Error('Pool error'));
      }

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
