/**
 * Admin override audit log service.
 *
 * All writes go through writeAuditLog(). The function is strictly INSERT-only —
 * there are intentionally no update or delete helpers. This enforces the
 * immutability guarantee at the application layer, backed by DB-level rules
 * in migration 009.
 */

import type { Pool } from 'pg';
import logger from '@/lib/logger';
import type {
  AdminOverrideAuditRow,
  WriteAuditParams,
  AuditEntityType,
  AuditActionType,
} from '@/lib/types/auditLog';

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Append an immutable audit record for an admin override action.
 *
 * @returns The newly created row (includes generated event_id and created_at).
 * @throws  On DB failure — callers should decide whether to surface the error
 *          or treat it as non-fatal (logging-only). For compliance-critical
 *          paths, surface the error and halt the override.
 */
export async function writeAuditLog(
  pool: Pool,
  params: WriteAuditParams
): Promise<AdminOverrideAuditRow> {
  const { rows } = await pool.query<AdminOverrideAuditRow>(
    `INSERT INTO admin_override_audit
       (admin_id, admin_display, entity_type, entity_id, action, reason,
        before_state, after_state, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      params.admin_id,
      params.admin_display ?? null,
      params.entity_type,
      params.entity_id,
      params.action,
      params.reason,
      params.before_state ? JSON.stringify(params.before_state) : null,
      params.after_state ? JSON.stringify(params.after_state) : null,
      JSON.stringify(params.metadata ?? {}),
    ]
  );

  const row = rows[0];
  if (!row) throw new Error('[auditLog] INSERT returned no row');

  logger.info('[auditLog] override recorded', {
    event_id: row.event_id,
    admin_id: row.admin_id,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    action: row.action,
  });

  return row;
}

// ── Read ──────────────────────────────────────────────────────────────────────

export interface QueryAuditLogsParams {
  admin_id?: string;
  entity_type?: AuditEntityType;
  entity_id?: string;
  action?: AuditActionType;
  limit?: number;
  offset?: number;
}

/**
 * Query the audit log with optional filters.
 * Returns paginated rows ordered by created_at DESC.
 */
export async function queryAuditLogs(
  pool: Pool,
  params: QueryAuditLogsParams = {}
): Promise<{ rows: AdminOverrideAuditRow[]; total: number }> {
  const { admin_id, entity_type, entity_id, action, limit = 20, offset = 0 } = params;

  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (admin_id) {
    conditions.push(`admin_id = $${idx++}`);
    values.push(admin_id);
  }
  if (entity_type) {
    conditions.push(`entity_type = $${idx++}`);
    values.push(entity_type);
  }
  if (entity_id) {
    conditions.push(`entity_id = $${idx++}`);
    values.push(entity_id);
  }
  if (action) {
    conditions.push(`action = $${idx++}`);
    values.push(action);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [countResult, dataResult] = await Promise.all([
    pool.query<{ total: number }>(
      `SELECT COUNT(*)::integer AS total FROM admin_override_audit ${where}`,
      values
    ),
    pool.query<AdminOverrideAuditRow>(
      `SELECT * FROM admin_override_audit ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limit, offset]
    ),
  ]);

  return {
    rows: dataResult.rows,
    total: countResult.rows[0]?.total ?? 0,
  };
}

/**
 * Fetch a single audit log row by its public event_id.
 * Returns null if not found.
 */
export async function getAuditLogByEventId(
  pool: Pool,
  eventId: string
): Promise<AdminOverrideAuditRow | null> {
  const { rows } = await pool.query<AdminOverrideAuditRow>(
    'SELECT * FROM admin_override_audit WHERE event_id = $1 LIMIT 1',
    [eventId]
  );
  return rows[0] ?? null;
}
