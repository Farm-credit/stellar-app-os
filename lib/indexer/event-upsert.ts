import type { Pool } from 'pg';

export type ContractEventType = 'TreeMinted' | 'ProgressSubmitted' | 'FundsReleased' | 'other';

export interface ContractEventRow {
  id: string;
  ledger: number;
  ledgerClosedAt: string;
  contractId: string;
  eventType: ContractEventType;
  topicsXdr: string[];
  valueXdr: string | null;
  pagingToken: string | null;
}

/**
 * Upsert a classified Soroban contract event.
 * ON CONFLICT DO NOTHING — idempotent and safe to replay on restart.
 */
export async function upsertContractEvent(pool: Pool, row: ContractEventRow): Promise<void> {
  await pool.query(
    `INSERT INTO contract_events
       (id, ledger, ledger_closed_at, contract_id, event_type, topics_xdr, value_xdr, paging_token)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (id) DO NOTHING`,
    [
      row.id,
      row.ledger,
      row.ledgerClosedAt,
      row.contractId,
      row.eventType,
      row.topicsXdr,
      row.valueXdr,
      row.pagingToken,
    ]
  );
}

/** Returns the ledger to start streaming from (0 = beginning of retention window). */
export async function loadEventCursor(pool: Pool, network: string): Promise<number> {
  const result = await pool.query<{ last_ledger: string }>(
    `SELECT last_ledger FROM event_indexer_cursors WHERE network = $1`,
    [network]
  );
  return result.rows[0] ? Number(result.rows[0].last_ledger) : 0;
}

/** Persist the last fully-processed ledger so the worker can resume after restart. */
export async function saveEventCursor(pool: Pool, network: string, ledger: number): Promise<void> {
  await pool.query(
    `INSERT INTO event_indexer_cursors (network, last_ledger, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (network)
     DO UPDATE SET last_ledger = EXCLUDED.last_ledger, updated_at = NOW()`,
    [network, ledger]
  );
}
