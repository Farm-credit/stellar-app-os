// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

import type { Metadata } from 'next';
import { MethodologyExplorer } from '@/components/MethodologyExplorer';

export const metadata: Metadata = {
  title: 'Carbon Calculation Methodologies Database | Farm-credit',
  description:
    'Comprehensive database of verified carbon calculation methodologies across reforestation, soil sequestration, renewable energy, methane reduction, and energy efficiency.',
};

export default function MethodologiesPage() {
  return (
    <main className="container mx-auto py-8 px-4 sm:px-6 lg:px-8 max-w-7xl">
      <MethodologyExplorer />
    </main>
  );
}
