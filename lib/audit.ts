/**
 * Audit logging helper (recreated — module was lost in a bad merge on main).
 *
 * Writes structured audit events to the admin_audit_log table when a database
 * is configured; falls back to stderr logging otherwise so callers never fail
 * because of audit logging.
 */

import { getPool } from '@/lib/db/client';

export interface AuditEvent {
  action: string;
  resource?: string;
  actorId?: string;
  details?: Record<string, unknown>;
}

export async function auditLog(event: AuditEvent): Promise<void> {
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO admin_audit_log (actor_id, action, resource, details, created_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())`,
      [
        event.actorId ?? 'system',
        event.action,
        event.resource ?? null,
        JSON.stringify(event.details ?? {}),
      ]
    );
  } catch (error) {
    console.error('[audit] failed to persist audit event:', error);
  }
}

export default auditLog;
