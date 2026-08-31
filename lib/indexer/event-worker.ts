/**
 * Minimal Soroban event indexer worker used to keep the project buildable.
 * The runtime behavior is intentionally lightweight and can be expanded later.
 */

import { SorobanRpc } from '@stellar/stellar-sdk';
import { getPool } from '@/lib/db/client';
import {
  upsertContractEvent,
  loadEventCursor,
  saveEventCursor,
  type ContractEventType,
} from '@/lib/indexer/event-upsert';
import type { NetworkType } from '@/lib/types/wallet';

const NETWORK = (process.env.STELLAR_NETWORK ?? 'testnet') as NetworkType;
const SOROBAN_RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org';
const POLL_INTERVAL_MS = 5_000;
const MAX_EVENTS_PER_POLL = 100;
const CONTRACT_IDS = (process.env.SOROBAN_CONTRACT_IDS ?? '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

const server = new SorobanRpc.Server(SOROBAN_RPC_URL, {
  allowHttp: SOROBAN_RPC_URL.startsWith('http://'),
});
const pool = getPool();

export async function pollContractEvents() {
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
  const response = await server.getEvents(request);

  const nextLedger = response.latestLedger ?? startLedger;
  if (nextLedger > startLedger) {
    await saveEventCursor(pool, NETWORK, nextLedger);
  }

  for (const event of response.events) {
    await upsertContractEvent(pool, {
      id: event.id,
      ledger: event.ledger,
      ledgerClosedAt: event.ledgerClosedAt,
      contractId:
        typeof event.contractId === 'string'
          ? event.contractId
          : (event.contractId?.toString() ?? ''),
      eventType: 'other' as ContractEventType,
      topicsXdr: [],
      valueXdr: null,
      pagingToken: event.pagingToken ?? null,
    });
  }
}

export async function main() {
  while (true) {
    try {
      await pollContractEvents();
    } catch (error) {
      console.error('[event-indexer] poll error:', error);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

if (process.env.NODE_ENV !== 'test') {
  main().catch((error) => {
    console.error('[event-indexer] fatal error:', error);
    process.exit(1);
  });
}
