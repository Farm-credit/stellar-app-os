import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock pg so no real connections are opened.
vi.mock('pg', () => ({
  Pool: vi.fn(),
}));

import { Pool } from 'pg';
import {
  getReadPool,
  getPrimaryPool,
  getReplicaUrls,
  queryRead,
  closeReadPools,
  resetReadPools,
} from '../read-replica';

const PRIMARY_URL = 'postgres://primary-host/db';
const REPLICA_A = 'postgres://replica-a/db';
const REPLICA_B = 'postgres://replica-b/db';

function mockPool() {
  return {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    on: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
  };
}

describe('read-replica', () => {
  let createdPools: any[];

  beforeEach(() => {
    vi.clearAllMocks();
    createdPools = [];
    (Pool as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const pool = mockPool();
      createdPools.push(pool);
      return pool;
    });

    resetReadPools();
    delete process.env.DATABASE_READ_REPLICA_URLS;
    delete process.env.DATABASE_URL_READ_REPLICA;
    delete process.env.DATABASE_URL;
  });

  afterEach(async () => {
    await closeReadPools();
    delete process.env.DATABASE_READ_REPLICA_URLS;
    delete process.env.DATABASE_URL_READ_REPLICA;
    delete process.env.DATABASE_URL;
  });

  describe('getReplicaUrls', () => {
    it('parses a comma-separated list and trims whitespace', () => {
      process.env.DATABASE_READ_REPLICA_URLS = ` ${REPLICA_A} , ${REPLICA_B} `;
      expect(getReplicaUrls()).toEqual([REPLICA_A, REPLICA_B]);
    });

    it('ignores empty entries', () => {
      process.env.DATABASE_READ_REPLICA_URLS = `${REPLICA_A},,`;
      expect(getReplicaUrls()).toEqual([REPLICA_A]);
    });

    it('falls back to the single legacy replica variable', () => {
      process.env.DATABASE_URL_READ_REPLICA = REPLICA_A;
      expect(getReplicaUrls()).toEqual([REPLICA_A]);
    });

    it('returns an empty array when nothing is configured', () => {
      expect(getReplicaUrls()).toEqual([]);
    });
  });

  describe('getReadPool', () => {
    it('returns a replica pool when replicas are configured', () => {
      process.env.DATABASE_URL = PRIMARY_URL;
      process.env.DATABASE_READ_REPLICA_URLS = REPLICA_A;

      const pool = getReadPool();
      expect(pool).toBeDefined();
      // Only the replica pool should have been created.
      expect(createdPools).toHaveLength(1);
    });

    it('round-robins across multiple replicas', () => {
      process.env.DATABASE_URL = PRIMARY_URL;
      process.env.DATABASE_READ_REPLICA_URLS = `${REPLICA_A},${REPLICA_B}`;

      const first = getReadPool();
      const second = getReadPool();
      const third = getReadPool();

      expect(first).not.toBe(second);
      expect(third).toBe(first);
    });

    it('falls back to the primary pool when no replica is configured', () => {
      process.env.DATABASE_URL = PRIMARY_URL;

      const pool = getReadPool();
      expect(pool).toBe(getPrimaryPool());
    });

    it('throws when neither replica nor primary is configured', () => {
      expect(() => getReadPool()).toThrow(/DATABASE_URL/);
    });
  });

  describe('queryRead', () => {
    it('executes the query against a replica pool', async () => {
      process.env.DATABASE_URL = PRIMARY_URL;
      process.env.DATABASE_READ_REPLICA_URLS = REPLICA_A;

      const pool = getReadPool();
      await queryRead('SELECT 1');

      expect(pool.query).toHaveBeenCalledWith('SELECT 1', undefined);
    });
  });

  describe('closeReadPools', () => {
    it('closes replica and primary pools', async () => {
      process.env.DATABASE_URL = PRIMARY_URL;
      process.env.DATABASE_READ_REPLICA_URLS = REPLICA_A;

      const replica = getReadPool();
      const primary = getPrimaryPool();

      await closeReadPools();

      expect(replica.end).toHaveBeenCalled();
      expect(primary.end).toHaveBeenCalled();
    });
  });
});
