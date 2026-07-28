import { z } from 'zod';

/** Validates POST /api/sanctions/lookup request body. */
export const sanctionLookupSchema = z.object({
  stellar_address: z
    .string()
    .min(1, 'stellar_address is required')
    .regex(/^G[A-Z2-7]{55}$/, 'Must be a valid Stellar public key (G… 56-char base32)'),
  context: z.string().max(200).optional(),
});

/** Validates query parameters for GET /api/sanctions/audit. */
export const sanctionAuditQuerySchema = z.object({
  address: z
    .string()
    .regex(/^G[A-Z2-7]{55}$/)
    .optional(),
  result: z
    .enum(['clear', 'flagged', 'error', 'cached_clear', 'cached_flagged'])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
