/**
 * Soroban Contract Event Indexer
 *
 * Polls the Soroban RPC `getEvents` endpoint for TreeMinted, ProgressSubmitted,
 * and FundsReleased events emitted by the on-chain tree contracts, then writes
 * them to PostgreSQL for fast off-chain queries.
 *
 * Run as a standalone process:
 *   pnpm indexer:events
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

// â”€â”€ Config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const NETWORK = (process.env.STELLAR_NETWORK ?? 'testnet') as NetworkType;
const SOROBAN_RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org';

// Optional comma-separated list of contract IDs to filter on.
// Leave empty to index all contracts (useful during initial setup).
const CONTRACT_IDS = (process.env.TREE_CONTRACT_IDS ?? '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

const POLL_INTERVAL_MS = 5_000;
const MAX_EVENTS_PER_POLL = 100;

// â”€â”€ Classification â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    // XDR decode failure â€” fall through to 'other'
  }
  return 'other';
}

function scValToXdrBase64(val: unknown): string {
  if (typeof val === 'string') return val;
  if (val instanceof xdr.ScVal) return val.toXDR('base64');
  return '';
}

// â”€â”€ Core â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, delayMs = 1000): Promise<T> {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === maxRetries) throw err;
      console.warn(`[event-indexer] retry ${i + 1}/${maxRetries}`);
      await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, i)));
    }
  }
  throw new Error('unreachable');
}

const server = new SorobanRpc.Server(SOROBAN_RPC_URL, {
  allowHttp: SOROBAN_RPC_URL.startsWith('http://'),
});
const pool = getPool();

async function pollContractEvents(): Promise<void> {
  const startLedger = await loadEventCursor(pool, NETWORK);

  const filter: SorobanRpc.Api.EventFilter = {
    type: 'contract',
    ...(CONTRACT_IDS.length > 0 ? { contractIds: CONTRACT_IDS } : {}),
  };

  const request: SorobanRpc.Server.GetEventsRequest = {
    filters: [filter],
    limit: MAX_EVENTS_PER_POLL,
    ...(startLedger > 0 ? { startLedger } : {}),
  };

  const response = await withRetry(() => server.getEvents(request));

  let maxLedger = startLedger;

  for (const event of response.events) {
    const topicsXdr: string[] = Array.isArray(event.topic) ? event.topic.map(scValToXdrBase64) : [];

    const eventType = classifyEvent(topicsXdr);
    const valueXdr = event.value != null ? scValToXdrBase64(event.value) : null;

    await withRetry(() =>
      upsertContractEvent(pool, {
        id: event.id,
        ledger: event.ledger,
        ledgerClosedAt: event.ledgerClosedAt,
        contractId:
          typeof event.contractId === 'string'
            ? event.contractId
            : (event.contractId?.toString() ?? ''),
        eventType,
        topicsXdr,
        valueXdr: valueXdr || null,
        pagingToken: event.pagingToken ?? null,
      })
    );

    if (event.ledger > maxLedger) maxLedger = event.ledger;
    console.info(`[event-indexer] ${event.id.slice(0, 20)}â€¦ â†’ ${eventType}`);
  }

  const nextLedger = maxLedger > startLedger ? maxLedger + 1 : (response.latestLedger ?? maxLedger);

  if (nextLedger > startLedger) {
    await saveEventCursor(pool, NETWORK, nextLedger);
  }
}

// â”€â”€ Entry Point â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function main(): Promise<void> {
  console.info(`[event-indexer] starting on ${NETWORK}`);
  console.info(`[event-indexer] Soroban RPC: ${SOROBAN_RPC_URL}`);
  if (CONTRACT_IDS.length > 0) {
    console.info(`[event-indexer] watching contracts: ${CONTRACT_IDS.join(', ')}`);
  } else {
    console.info('[event-indexer] watching all contracts (set TREE_CONTRACT_IDS to filter)');
  }

  while (true) {
    try {
      await pollContractEvents();
    } catch (err) {
      console.error('[event-indexer] poll error:', err);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main().catch((err) => {
  console.error('[event-indexer] fatal error:', err);
  process.exit(1);
});
