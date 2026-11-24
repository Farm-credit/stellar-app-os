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

import { ProjectComparisonTabs } from '@/components/ProjectComparisonTabs';
import { parseComparisonParams } from '@/lib/comparisonExport';

export const metadata: Metadata = {
  title: 'Compare Projects & Tree Sponsorship Offerings | Farm-credit',
  description:
    'Compare tree sponsorship offerings and carbon offset projects side-by-side on cost, species, CO2, survival rate, location, price, and co-benefits.',
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
  const searchObj = toSearchParams(params ?? {});
  const { ids, criteria } = parseComparisonParams(searchObj);
  const tabParam = searchObj.get('tab') || searchObj.get('mode');
  const defaultTab = tabParam === 'carbon' ? 'carbon' : 'sponsorship';

  return (
    <div className="container mx-auto py-8 px-4">
      <ProjectComparisonTabs
        initialProjectIds={ids}
        initialCriteria={criteria}
        defaultTab={defaultTab}
      />
    </div>
  );
}
