/**
 * Base worker class with built-in memory leak prevention.
 *
 * Every background job extends this class to get:
 * - Periodic heap monitoring and GC pressure warnings
 * - Automatic batch-size limiting to prevent unbounded memory growth
 * - Structured cleanup via the dispose() pattern
 * - Graceful shutdown on SIGTERM/SIGINT
 * - Connection pool lifecycle management
 *
 * Issue #1176: Memory leak investigation & fix.
 */

import { getPool, type Pool } from '@/lib/db/client';
import { logger } from '@/lib/logger';

export interface WorkerConfig {
  /** Human-readable job name for logs */
  name: string;
  /** Milliseconds between job runs (for scheduled workers) */
  intervalMs: number;
  /** Max rows to process per batch — keeps heap bounded */
  batchSize: number;
  /** Heap warning threshold in MB (default 400) */
  heapWarningMb?: number;
  /** Heap critical threshold in MB — force GC + pause (default 600) */
  heapCriticalMb?: number;
  /** Max consecutive errors before the worker stops */
  maxConsecutiveErrors?: number;
}

export interface WorkerMetrics {
  runs: number;
  batchesProcessed: number;
  rowsProcessed: number;
  errors: number;
  lastRunAt: Date | null;
  lastDurationMs: number;
  peakHeapMb: number;
  currentHeapMb: number;
}

/**
 * Abstract base — subclasses implement `processBatch(cursor)` to handle
 * one batch of work.  The base class handles scheduling, connection pooling,
 * heap monitoring, and cleanup.
 */
export abstract class BaseWorker {
  protected readonly config: Required<WorkerConfig>;
  protected pool: Pool;
  protected timer: ReturnType<typeof setInterval> | null = null;
  protected running = false;
  protected disposed = false;
  protected consecutiveErrors = 0;

  protected metrics: WorkerMetrics = {
    runs: 0,
    batchesProcessed: 0,
    rowsProcessed: 0,
    errors: 0,
    lastRunAt: null,
    lastDurationMs: 0,
    peakHeapMb: 0,
    currentHeapMb: 0,
  };

  private heapCheckTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: WorkerConfig) {
    this.config = {
      heapWarningMb: 400,
      heapCriticalMb: 600,
      maxConsecutiveErrors: 10,
      ...config,
    };
    this.pool = getPool();
    this.setupSignalHandlers();
    this.startHeapMonitor();
  }

  // ─── Abstract ────────────────────────────────────────────

  /**
   * Process one batch of work.  Return the number of rows processed.
   * When there is no more work, return 0.
   */
  protected abstract processBatch(batchSize: number): Promise<number>;

  /** Optional hook called once before the first run. */
  protected async onInit(): Promise<void> {}

  /** Optional hook called once during dispose(). */
  protected async onCleanup(): Promise<void> {}

  // ─── Lifecycle ───────────────────────────────────────────

  async start(): Promise<void> {
    if (this.running) return;
    logger.info(`[${this.config.name}] Starting worker`);

    await this.onInit();
    this.running = true;
    this.consecutiveErrors = 0;

    // Run immediately, then on interval
    await this.runLoop();
    this.timer = setInterval(() => void this.runLoop(), this.config.intervalMs);
  }

  stop(): void {
    if (!this.running) return;
    logger.info(`[${this.config.name}] Stopping worker`);

    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;

    logger.info(`[${this.config.name}] Disposing worker`);
    await this.stop();

    if (this.heapCheckTimer) {
      clearInterval(this.heapCheckTimer);
      this.heapCheckTimer = null;
    }

    await this.onCleanup();

    // Release the dedicated connection pool
    try {
      await this.pool.end();
    } catch (err) {
      logger.warn(`[${this.config.name}] Error closing pool:`, err);
    }

    // Force a final GC if available
    if (globalThis.gc) {
      globalThis.gc();
    }

    logger.info(`[${this.config.name}] Disposed. Final metrics:`, this.getMetrics());
  }

  // ─── Core Loop ───────────────────────────────────────────

  private async runLoop(): Promise<void> {
    if (!this.running || this.disposed) return;

    const start = Date.now();
    this.metrics.runs++;

    try {
      let totalRows = 0;
      let batches = 0;

      // Process in batches — this is the key memory-leak prevention.
      // Instead of loading all rows at once, we process `batchSize` rows,
      // release references, force GC check, then move to the next batch.
      // The loop exits when a batch returns 0 rows (no more work).
      while (this.running && !this.disposed) {
        const rows = await this.processBatch(this.config.batchSize);

        if (rows === 0) break;

        totalRows += rows;
        batches++;

        // Check heap after each batch
        this.checkHeap();

        // Yield to the event loop between batches to prevent blocking
        // and give V8 a chance to collect garbage.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }

      this.metrics.batchesProcessed += batches;
      this.metrics.rowsProcessed += totalRows;
      this.consecutiveErrors = 0;
    } catch (err) {
      this.consecutiveErrors++;
      this.metrics.errors++;
      logger.error(
        `[${this.config.name}] Run error (${this.consecutiveErrors}/${this.config.maxConsecutiveErrors}):`,
        err
      );

      if (this.consecutiveErrors >= this.config.maxConsecutiveErrors) {
        logger.error(`[${this.config.name}] Too many consecutive errors — stopping worker`);
        await this.stop();
      }
    } finally {
      this.metrics.lastRunAt = new Date();
      this.metrics.lastDurationMs = Date.now() - start;
    }
  }

  // ─── Heap Monitoring ─────────────────────────────────────

  private startHeapMonitor(): void {
    // Check heap every 30 seconds
    this.heapCheckTimer = setInterval(() => this.checkHeap(), 30_000);
  }

  private checkHeap(): void {
    const heap = process.memoryUsage();
    const heapMb = Math.round(heap.heapUsed / 1024 / 1024);
    const rssMb = Math.round(heap.rss / 1024 / 1024);

    this.metrics.currentHeapMb = heapMb;
    if (heapMb > this.metrics.peakHeapMb) {
      this.metrics.peakHeapMb = heapMb;
    }

    if (heapMb >= this.config.heapCriticalMb) {
      logger.error(
        `[${this.config.name}] CRITICAL heap: ${heapMb}MB (rss: ${rssMb}MB) ` +
          `>= ${this.config.heapCriticalMb}MB threshold — forcing GC`
      );
      // Force GC if exposed via --expose-gc
      if (globalThis.gc) {
        globalThis.gc();
        const after = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
        logger.info(`[${this.config.name}] After GC: ${after}MB (freed ${heapMb - after}MB)`);
      }
    } else if (heapMb >= this.config.heapWarningMb) {
      logger.warn(
        `[${this.config.name}] Heap warning: ${heapMb}MB >= ${this.config.heapWarningMb}MB threshold`
      );
    }
  }

  // ─── Signal Handling ─────────────────────────────────────

  private setupSignalHandlers(): void {
    const gracefulShutdown = async () => {
      logger.info(`[${this.config.name}] Received shutdown signal`);
      await this.dispose();
      process.exit(0);
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  }

  // ─── Public API ──────────────────────────────────────────

  getMetrics(): Readonly<WorkerMetrics> {
    return { ...this.metrics };
  }

  isRunning(): boolean {
    return this.running;
  }
}
