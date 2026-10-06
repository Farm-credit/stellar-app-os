/**
 * Types and validation for the carbon methodology library (v1).
 *
 * Kept local to lib/carbon/ following lib/carbon/types.ts. The zod schema is the
 * single source of truth for both the seed data files and the API output.
 */

import { z } from 'zod';

export const METHODOLOGY_CATEGORIES = [
  'reforestation',
  'soil_sequestration',
  'renewable_energy',
  'methane_reduction',
  'energy_efficiency',
] as const;

export type MethodologyCategory = (typeof METHODOLOGY_CATEGORIES)[number];

export const methodologyParameterSchema = z.object({
  /** Symbol as used in the formula, e.g. "EG_PJ,y" */
  symbol: z.string().min(1),
  name: z.string().min(1),
  /** Unit of measure; "dimensionless" or "-" when not applicable */
  unit: z.string().min(1),
  description: z.string().min(1),
});

export const carbonMethodologySchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug must be lowercase kebab-case'),
  code: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(METHODOLOGY_CATEGORIES),
  standard: z.string().min(1),
  /** Registry version checked against; null when not pinned */
  version: z.string().min(1).nullable(),
  description: z.string().min(1),
  formula: z.string().min(1),
  parameters: z.array(methodologyParameterSchema).min(1),
  applicability: z.array(z.string().min(1)).min(1),
  sourceRef: z.string().min(1),
  /** true = code/title(/version) confirmed against the registry page */
  metadataVerified: z.boolean(),
});

export type MethodologyParameter = z.infer<typeof methodologyParameterSchema>;
export type CarbonMethodology = z.infer<typeof carbonMethodologySchema>;

/** Row shape returned by pg for carbon_methodologies. */
export interface CarbonMethodologyRow {
  slug: string;
  code: string;
  name: string;
  category: MethodologyCategory;
  standard: string;
  version: string | null;
  description: string;
  formula: string;
  parameters: MethodologyParameter[];
  applicability: string[];
  source_ref: string;
  metadata_verified: boolean;
}
