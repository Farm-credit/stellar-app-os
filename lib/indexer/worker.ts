/**
 * Horizon Indexer Worker
 *
 * Streams transactions for one or more Stellar accounts using Horizon's
 * Server-Sent Events (SSE) endpoint. For each transaction it:
 *   1. Fetches the associated operations
 *   2. Classifies the transaction (donation / escrow / mint / other)
 *   3. Upserts into PostgreSQL
 *   4. Persists the paging token for crash-safe resumption
 *
 * Run as a standalone Node.js process:
 *   node --loader ts-node/esm lib/indexer/worker.ts
 * or via the npm script:
 *   pnpm indexer
 */

import { Horizon } from '@stellar/stellar-sdk';
import { getPool } from '@/lib/db/client';
import { classifyTransaction } from '@/lib/indexer/classify';
import { upsertTransaction, saveCursor, loadCursor } from '@/lib/indexer/upsert';
import type { NetworkType } from '@/lib/types/wallet';

// ── Config ────────────────────────────────────────────────────────────────────

const NETWORK = (process.env.STELLAR_NETWORK ?? 'testnet') as NetworkType;
const HORIZON_URL =
  NETWORK === 'mainnet' ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org';

// Comma-separated list of Stellar accounts to watch
const WATCH_ACCOUNTS = (process.env.INDEXER_WATCH_ACCOUNTS ?? '')
  .split(',')
  .map((a) => a.trim())
  .filter(Boolean);

// How long to wait before reconnecting after a stream error (ms)
const RECONNECT_DELAY_MS = 5_000;

// ── Types ─────────────────────────────────────────────────────────────────────

interface HorizonTxRecord {
  id: string;
  hash: string;
  ledger: number;
  created_at: string;
  source_account: string;
  memo_type?: string;
  memo?: string;
  paging_token: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface HorizonOpsResponse {
  _embedded: {
    records: Array<{
      type: string;
      asset_code?: string;
      asset_issuer?: string;
      amount?: string;
      to?: string;
    }>;
  };
}

// ── Core ──────────────────────────────────────────────────────────────────────

const server = new Horizon.Server(HORIZON_URL);
const pool = getPool();

async function fetchOps(txHash: string) {
  const res = await fetch(`${HORIZON_URL}/transactions/${txHash}/operations?limit=50`);
  if (!res.ok) return [];
  const data = (await res.json()) as HorizonOpsResponse;
  return data._embedded?.records ?? [];
}

async function handleTransaction(tx: HorizonTxRecord, watchAccount: string): Promise<void> {
  try {
    const ops = await fetchOps(tx.hash);
    const classified = classifyTransaction(
      { source_account: tx.source_account, memo_type: tx.memo_type, memo: tx.memo },
      ops,
      NETWORK
    );

    await upsertTransaction(
      pool,
      {
        txHash: tx.hash,
        ledger: tx.ledger,
        createdAt: tx.created_at,
        sourceAccount: tx.source_account,
        raw: tx,
      },
      classified
    );

    await saveCursor(pool, NETWORK, watchAccount, tx.paging_token);

    console.log(`[indexer] ${tx.hash.slice(0, 12)}… → ${classified.txType}`);
  } catch (err) {
    console.error(`[indexer] failed to process tx ${tx.hash}:`, err);
  }
}

async function streamAccount(watchAccount: string): Promise<void> {
  const cursor = await loadCursor(pool, NETWORK, watchAccount);
  console.log(`[indexer] streaming ${watchAccount} from cursor=${cursor}`);

  return new Promise((resolve) => {
    const closeStream = server
      .transactions()
      .forAccount(watchAccount)
      .cursor(cursor)
      .stream({
        onmessage: (tx) => {
          void handleTransaction(tx as unknown as HorizonTxRecord, watchAccount);
        },
        onerror: (err) => {
          console.error(`[indexer] stream error for ${watchAccount}:`, err);
          closeStream();
          // Reconnect after delay
          setTimeout(() => {
            void streamAccount(watchAccount).then(resolve);
          }, RECONNECT_DELAY_MS);
        },
      });
  });
}

async function main(): Promise<void> {
  if (WATCH_ACCOUNTS.length === 0) {
    console.error(
      '[indexer] INDEXER_WATCH_ACCOUNTS is empty. Set it to a comma-separated list of Stellar accounts.'
    );
    process.exit(1);
  }

  console.log(`[indexer] starting on ${NETWORK}, watching ${WATCH_ACCOUNTS.length} account(s)`);

  // Stream all accounts concurrently
  await Promise.all(WATCH_ACCOUNTS.map((account) => streamAccount(account)));
}

main().catch((err) => {
  console.error('[indexer] fatal error:', err);
  process.exit(1);
});
