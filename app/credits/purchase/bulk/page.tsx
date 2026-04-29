'use client';

import { BulkPurchaseFlow } from '@/components/organisms/BulkPurchaseFlow/BulkPurchaseFlow';
import { Text } from '@/components/atoms/Text';

export default function BulkPurchasePage() {
  return (
    <main className="container mx-auto px-4 py-12">
      <div className="mb-12 text-center">
        <Text variant="h1" className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          Corporate Bulk Procurement
        </Text>
        <Text variant="muted" className="mt-4 text-xl">
          Scale your environmental impact with verified carbon credits and comprehensive ESG
          reporting.
        </Text>
      </div>
      <BulkPurchaseFlow />
    </main>
  );
}
