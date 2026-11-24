/**
 * Carbon methodology library — read access (v1).
 *
 * Queries the carbon_methodologies table (migration 025). Read-only: there is
 * deliberately no create/update/delete here; content is managed through
 * data/carbon-methodologies/*.json and scripts/seed-carbon-methodologies.ts.
 */

import { z } from 'zod';
import { getPool } from '@/lib/db/client';
import {
  METHODOLOGY_CATEGORIES,
  type CarbonMethodology,
  type CarbonMethodologyRow,
} from '@/lib/carbon/methodologies/types';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const listMethodologiesQuerySchema = z.object({
  category: z.enum(METHODOLOGY_CATEGORIES).optional(),
  standard: z.string().trim().min(1).max(100).optional(),
  /** Case-insensitive search across code, name and description */
  q: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListMethodologiesQuery = z.infer<typeof listMethodologiesQuerySchema>;

export interface MethodologyListResult {
  methodologies: CarbonMethodology[];
  totalCount: number;
  limit: number;
  offset: number;
}

const COLUMNS = `slug, code, name, category, standard, version, description, formula,
  parameters, applicability, source_ref, metadata_verified`;

function toMethodology(row: CarbonMethodologyRow): CarbonMethodology {
  return {
    slug: row.slug,
    code: row.code,
    name: row.name,
    category: row.category,
    standard: row.standard,
    version: row.version,
    description: row.description,
    formula: row.formula,
    parameters: row.parameters,
    applicability: row.applicability,
    sourceRef: row.source_ref,
    metadataVerified: row.metadata_verified,
  };
}

/** Escape LIKE wildcards so user input is matched literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function listMethodologies(
  query: ListMethodologiesQuery
): Promise<MethodologyListResult> {
  const pool = getPool();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.category) {
    params.push(query.category);
    conditions.push(`category = $${params.length}`);
  }
  if (query.standard) {
    params.push(query.standard);
    conditions.push(`LOWER(standard) = LOWER($${params.length})`);
  }
  if (query.q) {
    params.push(`%${escapeLike(query.q)}%`);
    const n = params.length;
    conditions.push(`(code ILIKE $${n} OR name ILIKE $${n} OR description ILIKE $${n})`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await pool.query<{ total: number }>(
    `SELECT COUNT(*) AS total FROM carbon_methodologies ${where}`,
    params
  );
  const totalCount = Number(countResult.rows[0]?.total ?? 0);

  const pageParams = [...params, query.limit, query.offset];
  const { rows } = await pool.query<CarbonMethodologyRow>(
    `SELECT ${COLUMNS} FROM carbon_methodologies ${where}
     ORDER BY category, code
     LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
    pageParams
  );

  return {
    methodologies: rows.map(toMethodology),
    totalCount,
    limit: query.limit,
    offset: query.offset,
  };
}

export async function getMethodologyBySlug(slug: string): Promise<CarbonMethodology | null> {
  const { rows } = await getPool().query<CarbonMethodologyRow>(
    `SELECT ${COLUMNS} FROM carbon_methodologies WHERE slug = $1`,
    [slug]
  );
  return rows[0] ? toMethodology(rows[0]) : null;
}
