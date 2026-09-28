import { z } from 'zod';
import { CERTIFICATION_PROVIDERS } from './types';

const providerSchema = z.enum(CERTIFICATION_PROVIDERS);
const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9 ._:/-]*$/, 'contains unsupported characters');

export const projectReferenceSchema = z
  .object({
    provider: providerSchema,
    projectId: identifierSchema,
  })
  .strict();

export const creditVerificationRequestSchema = projectReferenceSchema
  .extend({
    serialNumber: identifierSchema.max(500),
    vintage: z.number().int().min(1900).max(2200).optional(),
    quantity: z.number().positive().max(1_000_000_000).optional(),
  })
  .strict();

export function validationErrors(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length ? issue.path.join('.') : 'request';
    return `${path}: ${issue.message}`;
  });
}
