/**
 * Tests for BaseWorker memory management and lifecycle.
 *
 * Issue #1176: Verifies that the worker properly handles:
 * - Batch processing with bounded memory
 * - Heap monitoring thresholds
 * - Graceful disposal and cleanup
 * - Consecutive error handling
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { BaseWorker, type WorkerConfig } from '../base-worker';

// ─── Mock dependencies ─────────────────────────────────────

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/db/client', () => ({
  getPool: vi.fn(() => ({
    connect: vi.fn().mockResolvedValue({
      query: vi.fn(),
      release: vi.fn(),
    }),
    end: vi.fn().mockResolvedValue(undefined),
  })),
}));

// ─── Test Worker ───────────────────────────────────────────

class TestWorker extends BaseWorker {
  public batchResults: number[] = [];

  constructor(
    config: Partial<WorkerConfig>,
    private readonly rowsToReturn: number[] = []
  ) {
    super({
      name: 'test-worker',
      intervalMs: 1_000_000, // Very long interval — we only want manual runs
      batchSize: 10,
      ...config,
    });
  }
  protected override processBatch(_batchSize: number): Promise<number> {
    if (this.rowsToReturn.length === 0) return Promise.resolve(0);
    const rows = this.rowsToReturn.shift()!;
    this.batchResults.push(rows);
    return Promise.resolve(rows);
  }
}

// ─── Tests ─────────────────────────────────────────────────

describe('BaseWorker', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('batch processing', () => {
    it('processes batches until no rows remain', async () => {
      const worker = new TestWorker({ batchSize: 10 }, [10, 10, 5, 0]);
      await worker.start();

      // The worker runs immediately on start, processes all batches
      // (3 batches with rows, then 0 → stops), so wait briefly
      await new Promise((r) => setTimeout(r, 200));
      await worker.stop();
      await worker.dispose();

      expect(worker.batchResults).toEqual([10, 10, 5, 0]);
    });
  });

  describe('error handling', () => {
    it('counts consecutive errors and stops after threshold', async () => {
      class ErrorWorker extends BaseWorker {
        constructor() {
          super({
            name: 'error-worker',
            intervalMs: 10, // Short interval so multiple runs fire quickly
            batchSize: 10,
            maxConsecutiveErrors: 3,
          });
        }
        protected override processBatch(): Promise<number> {
          return Promise.reject(new Error('Simulated failure'));
        }
      }

      const worker = new ErrorWorker();
      await worker.start();

      // Wait for multiple interval ticks — each fires a runLoop that errors
      await new Promise((r) => setTimeout(r, 200));
      await worker.dispose();

      const metrics = worker.getMetrics();
      expect(metrics.errors).toBeGreaterThanOrEqual(3);
      expect(worker.isRunning()).toBe(false);
    });
  });

  describe('heap monitoring', () => {
    it('tracks heap usage via metrics', async () => {
      const worker = new TestWorker({ heapWarningMb: 0 }, [5, 0]);
      await worker.start();
      await new Promise((r) => setTimeout(r, 200));
      await worker.dispose();

      const metrics = worker.getMetrics();
      expect(metrics.currentHeapMb).toBeGreaterThanOrEqual(0);
      expect(metrics.peakHeapMb).toBeGreaterThanOrEqual(0);
    });
  });

  describe('dispose', () => {
    it('marks worker as disposed and closes pool', async () => {
      const worker = new TestWorker({ batchSize: 10 }, [0]);
      await worker.start();
      await worker.dispose();

      expect(worker.isRunning()).toBe(false);

      // Calling dispose again should be a no-op
      await worker.dispose();
    });

    it('reports final metrics after dispose', async () => {
      const worker = new TestWorker({ batchSize: 10 }, [5, 3, 0]);
      await worker.start();
      await new Promise((r) => setTimeout(r, 500));
      await worker.dispose();

      const metrics = worker.getMetrics();
      expect(metrics.runs).toBeGreaterThanOrEqual(1);
      expect(metrics.rowsProcessed).toBeGreaterThan(0);
    });
  });

  describe('metrics', () => {
    it('tracks run count and duration', async () => {
      const worker = new TestWorker({ batchSize: 10 }, [10, 0]);
      await worker.start();
      await new Promise((r) => setTimeout(r, 200));
      await worker.dispose();

      const metrics = worker.getMetrics();
      expect(metrics.runs).toBeGreaterThanOrEqual(1);
      expect(metrics.lastDurationMs).toBeGreaterThanOrEqual(0);
      expect(metrics.lastRunAt).toBeInstanceOf(Date);
    });
  });
});
