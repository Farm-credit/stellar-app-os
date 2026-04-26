import type { Pool } from 'pg';
import type { ClassifiedTx } from '@/lib/indexer/classify';

export interface IndexedTxRow {
  txHash: string;
  ledger: number;
  createdAt: string;
  sourceAccount: string;
  raw: object;
}

/**
 * Upsert a classified transaction into indexed_transactions.
 * ON CONFLICT (tx_hash) DO NOTHING — idempotent, safe to replay.
 */
export async function upsertTransaction(
  pool: Pool,
  row: IndexedTxRow,
  classified: ClassifiedTx
): Promise<void> {
  await pool.query(
    `INSERT INTO indexed_transactions
       (tx_hash, ledger, created_at, source_account,
        tx_type, asset_code, asset_issuer, amount, destination, memo, raw)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (tx_hash) DO NOTHING`,
    [
      row.txHash,
      row.ledger,
      row.createdAt,
      row.sourceAccount,
      classified.txType,
      classified.assetCode,
      classified.assetIssuer,
      classified.amount,
      classified.destination,
      classified.memo,
      JSON.stringify(row.raw),
    ]
  );
}

/** Persist the latest paging token so the worker can resume after restart. */
export async function saveCursor(
  pool: Pool,
  network: string,
  watchAccount: string,
  pagingToken: string
): Promise<void> {
  await pool.query(
    `INSERT INTO indexer_cursors (network, watch_account, last_paging_token, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (network, watch_account)
     DO UPDATE SET last_paging_token = EXCLUDED.last_paging_token,
                   updated_at        = NOW()`,
    [network, watchAccount, pagingToken]
  );
}

/** Load the last saved paging token (returns 'now' if none). */
export async function loadCursor(
  pool: Pool,
  network: string,
  watchAccount: string
): Promise<string> {
  const result = await pool.query<{ last_paging_token: string }>(
    `SELECT last_paging_token FROM indexer_cursors
     WHERE network = $1 AND watch_account = $2`,
    [network, watchAccount]
  );
  return result.rows[0]?.last_paging_token ?? 'now';
}
