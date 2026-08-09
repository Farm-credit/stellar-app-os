/**
 * PostgreSQL CDC Event Indexer Worker
 *
 * Listens for Soroban contract events via Soroban RPC `getEvents` and indexes
 * them into PostgreSQL. This is a background service designed to run as a
 * standalone Node.js process.
 *
 * Features:
 * - Poll-based ingestion with configurable interval
 * - Exponential backoff retry on RPC failures
 * - Cursor persistence for crash-safe resumption
 * - Structured logging with correlation IDs
 * - Graceful shutdown on SIGTERM/SIGINT
 * - Contract ID filtering support
 *
 * Run: pnpm indexer:cdc
 */

import { SorobanRpc, xdr } from '@stellar/stellar-sdk';
import { getPool } from '@/lib/db/client';
import {
  upsertContractEvent,
  loadEventCursor,
  saveEventCursor,
  type ContractEventType,
} from '@/lib/indexer/event-upsert';
import type { NetworkType } from '@/lib/types/wallet';
import logger from '@/lib/logger';

// ── Configuration ─────────────────────────────────────────────────────────────

const NETWORK = (process.env.STELLAR_NETWORK ?? 'testnet') as NetworkType;
const SOROBAN_RPC_URL = process.env.SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org';

const CONTRACT_IDS = (process.env.TREE_CONTRACT_IDS ?? '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

const POLL_INTERVAL_MS = Number(process.env.CDC_POLL_INTERVAL_MS ?? '5000');
const MAX_EVENTS_PER_POLL = Number(process.env.CDC_MAX_EVENTS_PER_POLL ?? '100');
const MAX_RETRIES = Number(process.env.CDC_MAX_RETRIES ?? '3');
const RETRY_BASE_DELAY_MS = Number(process.env.CDC_RETRY_BASE_DELAY_MS ?? '1000');
const RPC_TIMEOUT_MS = Number(process.env.CDC_RPC_TIMEOUT_MS ?? '10000');

// ── Types ───────────────────────────────────────────────────────────────────

export interface CDCWorkerConfig {
  network: NetworkType;
  sorobanRpcUrl: string;
  contractIds: string[];
  pollIntervalMs: number;
  maxEventsPerPoll: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  rpcTimeoutMs: number;
}

export interface ParsedEvent {
  id: string;
  ledger: number;
  ledgerClosedAt: string;
  contractId: string;
  eventType: ContractEventType;
  topicsXdr: string[];
  valueXdr: string | null;
  pagingToken: string | null;
}

// ── Event Classification ────────────────────────────────────────────────────

const KNOWN_EVENTS = new Set<ContractEventType>([
  'TreeMinted',
  'ProgressSubmitted',
  'FundsReleased',
]);

function classifyEvent(topicsXdr: string[]): ContractEventType {
  try {
    const first = topicsXdr[0];
    if (!first) return 'other';
    const scVal = xdr.ScVal.fromXDR(first, 'base64');
    if (scVal.switch().name === 'scvSymbol') {
      const name = scVal.sym().toString() as ContractEventType;
      return KNOWN_EVENTS.has(name) ? name : 'other';
    }
  } catch {
    // XDR decode failure — fall through to 'other'
  }
  return 'other';
}

function scValToXdrBase64(val: unknown): string {
  if (typeof val === 'string') return val;
  if (val instanceof xdr.ScVal) return val.toXDR('base64');
  return '';
}

// ── Retry Utility ───────────────────────────────────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  baseDelayMs: number,
  context: string
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isLast = attempt === maxRetries;
      const errorMessage = err instanceof Error ? err.message : String(err);

      logger.warn(`[cdc-worker] ${context} failed (attempt ${attempt + 1}/${maxRetries + 1})`, {
        error: errorMessage,
        willRetry: !isLast,
      });

      if (isLast) throw err;

      const delay = baseDelayMs * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error('unreachable');
}

// ── RPC Client ──────────────────────────────────────────────────────────────

function createRpcClient(url: string, timeoutMs: number): SorobanRpc.Server {
  return new SorobanRpc.Server(url, {
    allowHttp: url.startsWith('http://'),
    timeout: timeoutMs,
  });
}

// ── Event Parsing ───────────────────────────────────────────────────────────

function parseRpcEvent(event: SorobanRpc.Api.EventResponse): ParsedEvent {
  const topicsXdr: string[] = Array.isArray(event.topic) ? event.topic.map(scValToXdrBase64) : [];

  const eventType = classifyEvent(topicsXdr);
  const valueXdr = event.value != null ? scValToXdrBase64(event.value) : null;

  return {
    id: event.id,
    ledger: event.ledger,
    ledgerClosedAt: event.ledgerClosedAt,
    contractId:
      typeof event.contractId === 'string'
        ? event.contractId
        : (event.contractId?.toString() ?? ''),
    eventType,
    topicsXdr,
    valueXdr,
    pagingToken: event.pagingToken ?? null,
  };
}

// ── Core Polling Loop ───────────────────────────────────────────────────────

export class CDCEventIndexer {
  private readonly server: SorobanRpc.Server;
  private readonly pool: ReturnType<typeof getPool>;
  private readonly config: CDCWorkerConfig;
  private running = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: Partial<CDCWorkerConfig> = {}) {
    this.config = {
      network: config.network ?? NETWORK,
      sorobanRpcUrl: config.sorobanRpcUrl ?? SOROBAN_RPC_URL,
      contractIds: config.contractIds ?? CONTRACT_IDS,
      pollIntervalMs: config.pollIntervalMs ?? POLL_INTERVAL_MS,
      maxEventsPerPoll: config.maxEventsPerPoll ?? MAX_EVENTS_PER_POLL,
      maxRetries: config.maxRetries ?? MAX_RETRIES,
      retryBaseDelayMs: config.retryBaseDelayMs ?? RETRY_BASE_DELAY_MS,
      rpcTimeoutMs: config.rpcTimeoutMs ?? RPC_TIMEOUT_MS,
    };

    this.server = createRpcClient(this.config.sorobanRpcUrl, this.config.rpcTimeoutMs);
    this.pool = getPool();
  }

  async start(): Promise<void> {
    if (this.running) {
      logger.warn('[cdc-worker] already running');
      return;
    }

    this.running = true;
    logger.info('[cdc-worker] starting', {
      network: this.config.network,
      rpcUrl: this.config.sorobanRpcUrl,
      contracts: this.config.contractIds.length > 0 ? this.config.contractIds : 'all',
    });

    while (this.running) {
      const loopStart = Date.now();
      try {
        await this.poll();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error('[cdc-worker] poll cycle error', { error: message });
      }

      if (!this.running) break;

      const elapsed = Date.now() - loopStart;
      const remaining = Math.max(0, this.config.pollIntervalMs - elapsed);
      await this.delay(remaining);
    }

    logger.info('[cdc-worker] stopped');
  }

  stop(): void {
    if (!this.running) return;
    logger.info('[cdc-worker] stopping gracefully...');
    this.running = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async poll(): Promise<void> {
    const startLedger = await loadEventCursor(this.pool, this.config.network);

    const filter: SorobanRpc.Api.EventFilter = {
      type: 'contract',
      ...(this.config.contractIds.length > 0 ? { contractIds: this.config.contractIds } : {}),
    };

    const request: SorobanRpc.Server.GetEventsRequest = {
      filters: [filter],
      limit: this.config.maxEventsPerPoll,
      ...(startLedger > 0 ? { startLedger } : {}),
    };

    const response = await withRetry(
      () => this.server.getEvents(request),
      this.config.maxRetries,
      this.config.retryBaseDelayMs,
      'getEvents'
    );

    let maxLedger = startLedger;
    let processedCount = 0;

    for (const event of response.events) {
      const parsed = parseRpcEvent(event);

      await withRetry(
        () => upsertContractEvent(this.pool, parsed),
        this.config.maxRetries,
        this.config.retryBaseDelayMs,
        `upsertEvent(${parsed.id.slice(0, 20)})`
      );

      if (event.ledger > maxLedger) {
        maxLedger = event.ledger;
      }
      processedCount++;
    }

    const nextLedger =
      maxLedger > startLedger ? maxLedger + 1 : (response.latestLedger ?? maxLedger);

    if (nextLedger > startLedger) {
      await withRetry(
        () => saveEventCursor(this.pool, this.config.network, nextLedger),
        this.config.maxRetries,
        this.config.retryBaseDelayMs,
        'saveCursor'
      );
    }

    if (processedCount > 0) {
      logger.info('[cdc-worker] batch complete', {
        processed: processedCount,
        nextLedger,
        startLedger,
      });
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.pollTimer = setTimeout(() => {
        this.pollTimer = null;
        resolve();
      }, ms);
    });
  }
}

// ── Entry Point ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const indexer = new CDCEventIndexer();

  const shutdown = (signal: string) => {
    logger.info(`[cdc-worker] received ${signal}`);
    indexer.stop();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  await indexer.start();
}

// Only run main if this file is executed directly (not imported for tests)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    logger.error('[cdc-worker] fatal error', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });
}

export default CDCEventIndexer;
