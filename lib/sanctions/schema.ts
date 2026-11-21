import { z } from 'zod';

/**
 * Zod schemas for the sanctions subsystem.
 *
 * Stellar public keys are 56-char G-prefixed Base32 strings.
 */

// ── Stellar address validation ────────────────────────────────────────────────

const stellarAddressSchema = z
  .string()
  .length(56, 'Stellar address must be exactly 56 characters')
  .regex(/^G[A-Z2-7]{55}$/, 'Invalid Stellar public key format');

// ── POST /api/sanctions/lookup ────────────────────────────────────────────────

export const sanctionLookupSchema = z.object({
  stellar_address: stellarAddressSchema,
  context: z.string().max(255).optional(),
});

export type SanctionLookupInput = z.infer<typeof sanctionLookupSchema>;

// ── GET /api/sanctions/audit ──────────────────────────────────────────────────

export const sanctionAuditQuerySchema = z.object({
  address: stellarAddressSchema.optional(),
  result: z.enum(['clear', 'flagged', 'error', 'cached_clear', 'cached_flagged']).optional(),
  limit: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? Math.min(Number(v), 100) : 20))
    .pipe(z.number().int().min(1).max(100)),
  offset: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? Number(v) : 0))
    .pipe(z.number().int().min(0)),
});

export type SanctionAuditQueryInput = z.infer<typeof sanctionAuditQuerySchema>;
