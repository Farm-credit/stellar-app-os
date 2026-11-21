// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

import type { Metadata } from 'next';
import Link from 'next/link';
import { MethodologyExplorer } from '@/components/MethodologyExplorer';
import { CO2_METHODOLOGY_PATH } from '@/lib/carbon/ipcc-tier1';

export const metadata: Metadata = {
  title: 'Carbon Calculation Methodologies Database | Farm-credit',
  description:
    'Comprehensive database of verified carbon calculation methodologies across reforestation, soil sequestration, renewable energy, methane reduction, and energy efficiency.',
};

export default function MethodologiesPage() {
  return (
    <main className="container mx-auto py-8 px-4 sm:px-6 lg:px-8 max-w-7xl">
      <p className="mb-6 text-sm">
        Tree CO₂ figures use our{' '}
        <Link href={CO2_METHODOLOGY_PATH} className="font-medium underline underline-offset-2">
          IPCC Tier 1 sequestration method
        </Link>
        .
      </p>
      <MethodologyExplorer />
    </main>
  );
}
