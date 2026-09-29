/**
 * GDPR data export / erasure helpers (recreated — module was lost in a bad
 * merge on main). Works over the primary Postgres pool: collects every row
 * tied to a user id, and deletes them in reverse dependency order.
 */

import { getPool } from '@/lib/db/client';

/** Tables that hold user-owned rows, keyed by their user reference column. */
const USER_TABLES: ReadonlyArray<readonly [table: string, column: string]> = [
  ['trees', 'sponsor_address'],
  ['progress_updates', 'user_id'],
  ['notifications', 'user_id'],
  ['newsletter_subscriptions', 'user_id'],
];

function toJsKeys(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      const jsKey = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
      out[jsKey] = value;
    }
    return out;
  });
}

/** Collects all personal data held for a user (DSAR export). */
export async function exportUserData(userId: string): Promise<Record<string, unknown>> {
  const pool = getPool();
  const data: Record<string, unknown> = { userId, exportedAt: new Date().toISOString() };

  for (const [table, column] of USER_TABLES) {
    try {
      const result = await pool.query(`SELECT * FROM ${table} WHERE ${column} = $1`, [userId]);
      data[table] = toJsKeys(result.rows);
    } catch (error) {
      console.error(`[gdpr] export failed for table ${table}:`, error);
      data[table] = { error: 'unavailable' };
    }
  }

  return data;
}

/** Deletes all personal data held for a user (right to erasure). */
export async function deleteUserData(userId: string): Promise<{ deletedFrom: string[] }> {
  const pool = getPool();
  const deletedFrom: string[] = [];

  for (const [table, column] of USER_TABLES) {
    try {
      const result = await pool.query(`DELETE FROM ${table} WHERE ${column} = $1`, [userId]);
      deletedFrom.push(`${table}(${result.rowCount ?? 0})`);
    } catch (error) {
      console.error(`[gdpr] delete failed for table ${table}:`, error);
    }
  }

  return { deletedFrom };
}
