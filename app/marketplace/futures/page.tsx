import type { Metadata } from 'next';
import { CarbonFuturesTrading } from '@/components/organisms/CarbonFutures/CarbonFuturesTrading';

export const metadata: Metadata = {
  title: 'Carbon Futures | Stellar App OS',
  description: 'Lock in future carbon credit prices for the next delivery season.',
};

export default function CarbonFuturesPage() {
  return (
    <main className="min-h-screen bg-background px-4 pb-16 pt-24 md:px-8 lg:px-12">
      <CarbonFuturesTrading />
    </main>
  );
}
