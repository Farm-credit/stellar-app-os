// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

import type { Metadata } from 'next';
import { TreeSponsorshipComparison } from '@/components/TreeSponsorshipComparison';

export const metadata: Metadata = {
  title: 'Compare Tree Sponsorship Offerings | Farm-credit',
  description:
    'Allow sponsors to compare the tree sponsorship offering across different projects on a structured data table (cost, species, CO2, survival rate, location).',
};

type SearchParams = Record<string, string | string[] | undefined>;

export default async function SponsorComparePage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const idsParam = params.ids;
  const initialIds =
    typeof idsParam === 'string'
      ? idsParam
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : Array.isArray(idsParam)
        ? idsParam.map(String)
        : undefined;

  return (
    <main id="main-content" className="container mx-auto py-8 px-4 max-w-7xl">
      <TreeSponsorshipComparison initialProjectIds={initialIds} />
    </main>
  );
}
