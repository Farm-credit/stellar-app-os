import { OrderHistoryTable } from '@/components/organisms/OrderHistory';
import { Text } from '@/components/atoms/Text';

export const metadata = {
  title: 'Order History | Stellar Carbon Marketplace',
  description:
    'View your carbon credit buy and sell history with verifiable Stellar blockchain links.',
};

export default function OrderHistoryPage() {
  return (
    <div className="container mx-auto py-10 px-4 md:px-6">
      <div className="flex flex-col gap-2 mb-8">
        <Text variant="h2">Order History</Text>
        <Text variant="muted">
          Manage and track your carbon credit trading activity. For tax purposes, you can export
          your records to CSV.
        </Text>
      </div>

      <OrderHistoryTable />
    </div>
  );
}
