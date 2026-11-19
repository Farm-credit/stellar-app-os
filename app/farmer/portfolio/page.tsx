// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

import { Metadata } from 'next';
import { getFarmerPortfolio } from '@/lib/api/farmer-portfolio';
import { FarmerPortfolioView } from '@/components/organisms/FarmerPortfolio/FarmerPortfolioView';

export const metadata: Metadata = {
  title: 'Farmer Project Portfolio | Stellar Farm Credit',
  description: 'Farmer profile showing all listed projects: total acres, total credits available, average price, buyer reviews, and certification status.',
};

// Default featured farmer address
const DEFAULT_FARMER = 'GBZXN7PIRZGNMHGA72XZQGBG66AGDCKTHJNRQ6T6O4B37666U2N2C62Z';

export default async function DefaultFarmerPortfolioPage() {
  const portfolio = await getFarmerPortfolio(DEFAULT_FARMER);

  return (
    <main className="min-h-screen bg-background/50">
      <FarmerPortfolioView portfolio={portfolio} />
    </main>
  );
}
