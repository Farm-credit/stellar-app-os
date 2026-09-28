// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFarmerPortfolio, isStellarAddress } from '@/lib/api/farmer-portfolio';
import { FarmerPortfolioView } from '@/components/organisms/FarmerPortfolio/FarmerPortfolioView';

interface PageProps {
  params: Promise<{ address: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { address } = await params;
  return {
    title: `Farmer Portfolio (${address.slice(0, 8)}...) | Stellar Farm Credit`,
    description: `Farmer portfolio showing listed carbon projects, total acres, available credits, average price, buyer reviews, and certification status.`,
  };
}

export default async function FarmerPortfolioPage({ params }: PageProps) {
  const { address } = await params;

  if (!isStellarAddress(address)) {
    notFound();
  }

  const portfolio = await getFarmerPortfolio(address);

  return (
    <main className="min-h-screen bg-background/50">
      <FarmerPortfolioView portfolio={portfolio} />
    </main>
  );
}
