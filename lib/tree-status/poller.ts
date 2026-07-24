import { getPool } from '@/lib/db/client';
import { TREE_TX_TYPES, classifyTreeEvent, type TreeStatusEvent } from './types';

interface TreeTxRow {
  tx_hash: string;
  created_at: string;
  tx_type: string;
  amount: string | null;
  source_account: string | null;
  destination: string | null;
}

export class TreeStatusPoller {
  private lastTxHash: string | null = null;
  private pollIntervalMs: number;

  constructor(pollIntervalMs = 3000) {
    this.pollIntervalMs = pollIntervalMs;
  }

  setLastTxHash(hash: string | null) {
    this.lastTxHash = hash;
  }

  async poll(): Promise<TreeStatusEvent[]> {
    const pool = getPool();
    const placeholders = TREE_TX_TYPES.map((_, i) => `$${i + 1}`).join(',');
    const values = TREE_TX_TYPES;

    let sql: string;
    const params: unknown[] = [];

    if (this.lastTxHash) {
      sql = `SELECT tx_hash, created_at, tx_type, amount, source_account, destination
             FROM indexed_transactions
             WHERE tx_type IN (${placeholders}) AND tx_hash > $${values.length + 1}
             ORDER BY created_at ASC, tx_hash ASC`;
      params.push(...values, this.lastTxHash);
    } else {
      sql = `SELECT tx_hash, created_at, tx_type, amount, source_account, destination
             FROM indexed_transactions
             WHERE tx_type IN (${placeholders})
             ORDER BY created_at ASC, tx_hash ASC
             LIMIT 100`;
      params.push(...values);
    }

    const result = await pool.query<TreeTxRow>(sql, params);
    const rows = result.rows;

    if (rows.length === 0) return [];

    this.lastTxHash = rows[rows.length - 1].tx_hash;

    const events: TreeStatusEvent[] = [];

    for (const row of rows) {
      const eventType = classifyTreeEvent(row.tx_type);
      if (!eventType) continue;

      events.push({
        id: row.tx_hash,
        type: eventType,
        transactionHash: row.tx_hash,
        timestamp: row.created_at,
        amount: row.amount,
        sourceAccount: row.source_account,
        destination: row.destination,
      });
    }

    return events;
  }
}
