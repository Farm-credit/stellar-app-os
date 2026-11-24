import { z } from 'zod';

const ENTITY_TYPES = [
  'tree',
  'planter',
  'dispute',
  'transaction',
  'credit',
  'user',
  'payout',
  'sanction_cache',
  'webhook_subscription',
  'species',
] as const;

const ACTION_TYPES = [
  'status_override',
  'payment_release',
  'payment_hold',
  'kyc_override',
  'dispute_resolve',
  'blacklist_add',
  'blacklist_remove',
  'sanction_clear',
  'data_correction',
  'account_suspend',
  'account_reinstate',
  'credit_adjustment',
  'config_change',
] as const;

/** Validates POST /api/admin/audit request body. */
export const writeAuditSchema = z.object({
  entity_type: z.enum(ENTITY_TYPES),
  entity_id: z.string().min(1).max(255),
  action: z.enum(ACTION_TYPES),
  reason: z
    .string()
    .min(10, 'Reason must be at least 10 characters')
    .max(2000, 'Reason must not exceed 2000 characters'),
  before_state: z.record(z.unknown()).optional().nullable(),
  after_state: z.record(z.unknown()).optional().nullable(),
  metadata: z.record(z.unknown()).optional(),
});

/** Validates GET /api/admin/audit query parameters. */
export const auditQuerySchema = z.object({
  admin_id: z.string().max(255).optional(),
  entity_type: z.enum(ENTITY_TYPES).optional(),
  entity_id: z.string().max(255).optional(),
  action: z.enum(ACTION_TYPES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
