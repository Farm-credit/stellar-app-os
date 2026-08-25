import { type Metadata } from 'next';
import { TransactionHistory } from '@/components/organisms/TransactionHistory/TransactionHistory';

export const metadata: Metadata = {
  title: 'Transaction History | Stellar App OS',
  description: 'View all on-chain activity for your connected Stellar wallet.',
};

export default function TransactionsPage() {
  return (
    <main className="min-h-screen bg-background pt-24 pb-16 px-4 md:px-8 lg:px-12">
      <div className="max-w-4xl mx-auto">
        <TransactionHistory />
      </div>
    </main>
  );
}
