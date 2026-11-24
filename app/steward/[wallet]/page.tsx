import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getStewardPortfolio, isValidStewardWallet } from '@/lib/api/steward-portfolio';
import { StewardPortfolioView } from './portfolio-view';

interface PageProps {
  params: Promise<{ wallet: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { wallet } = await params;
  return {
    title: `Steward Portfolio (${wallet.slice(0, 6)}…${wallet.slice(-4)})`,
    description: 'Public tree planting and environmental impact portfolio.',
  };
}

export default async function StewardPortfolioPage({ params }: PageProps) {
  const { wallet } = await params;
  if (!isValidStewardWallet(wallet)) notFound();

  const portfolio = await getStewardPortfolio(wallet);
  return <StewardPortfolioView portfolio={portfolio} />;
}
