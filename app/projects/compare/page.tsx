// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

/**
 * Project Comparison Page
 * Issue #1354: Project comparison tool - side-by-side review (v1)
 *
 * Reads the `?ids=` / `?cols=` selection produced by the tool's share links
 * (and by `GET /api/comparison/export`) so a shared or bookmarked comparison
 * reopens exactly as it was sent.
 */

import type { Metadata } from 'next';

import { ProjectComparisonTool } from '@/components/ProjectComparisonTool';
import { parseComparisonParams } from '@/lib/comparisonExport';

export const metadata: Metadata = {
  title: 'Compare carbon offset projects | Farm-credit',
  description:
    'Compare carbon offset projects side-by-side on price, co-benefits, methodology, verifier, risk rating and buyer reviews.',
};

type SearchParams = Record<string, string | string[] | undefined>;

function toSearchParams(params: SearchParams): URLSearchParams {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') {
      search.set(key, value);
    } else if (Array.isArray(value)) {
      for (const entry of value) search.append(key, entry);
    }
  }
  return search;
}

export default async function ProjectComparisonPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const { ids, criteria } = parseComparisonParams(toSearchParams(params ?? {}));

  return (
    <div className="container mx-auto py-8 px-4">
      <ProjectComparisonTool initialProjectIds={ids} initialCriteria={criteria} />
    </div>
  );
}
