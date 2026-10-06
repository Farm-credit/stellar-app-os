/**
 * Loads and validates the methodology seed data in data/carbon-methodologies/.
 *
 * Node-only (uses fs). Shared by scripts/seed-carbon-methodologies.ts and the
 * dataset tests so that bad data fails without needing a database.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { carbonMethodologySchema, type CarbonMethodology } from './types';

export const DATASET_DIR = resolve(process.cwd(), 'data/carbon-methodologies');

/** Read every *.json file in the dataset directory (sorted, so output is stable). */
export function loadMethodologyDataset(dir: string = DATASET_DIR): CarbonMethodology[] {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();

  const all: CarbonMethodology[] = [];
  const seen = new Map<string, string>();

  for (const file of files) {
    const raw: unknown = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    if (!Array.isArray(raw)) {
      throw new Error(`${file}: expected a JSON array`);
    }
    raw.forEach((entry, i) => {
      const parsed = carbonMethodologySchema.safeParse(entry);
      if (!parsed.success) {
        const detail = parsed.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ');
        throw new Error(`${file}[${i}]: ${detail}`);
      }
      const prior = seen.get(parsed.data.slug);
      if (prior) {
        throw new Error(`${file}[${i}]: duplicate slug "${parsed.data.slug}" (also in ${prior})`);
      }
      seen.set(parsed.data.slug, file);
      all.push(parsed.data);
    });
  }
  return all;
}
