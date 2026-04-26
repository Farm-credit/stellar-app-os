import { type JSX } from 'react';
import { BulkPurchaseForm } from '@/components/organisms/BulkPurchaseForm/BulkPurchaseForm';
import { mockCarbonProjects } from '@/lib/api/mock/carbonProjects';
import { BULK_PURCHASE_MIN_QUANTITY } from '@/lib/types/carbon';
import { Building2 } from 'lucide-react';

export const metadata = {
  title: 'Bulk Purchase — FarmCredit',
  description: `Purchase ${BULK_PURCHASE_MIN_QUANTITY.toLocaleString()}+ carbon credit tokens for corporate planting initiatives with optional on-chain or IPFS metadata.`,
};

export default function BulkPurchasePage(): JSX.Element {
  return (
    <main className="container mx-auto px-4 py-10 max-w-2xl">
      <div className="mb-8 space-y-2">
        <div className="flex items-center gap-2">
          <Building2 className="h-6 w-6 text-stellar-blue" aria-hidden="true" />
          <h1 className="text-2xl font-semibold">Corporate bulk purchase</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Purchase {BULK_PURCHASE_MIN_QUANTITY.toLocaleString()}+ carbon credit tokens for branded
          planting initiatives. Optionally attach metadata on-chain or via IPFS.
        </p>
      </div>

      <BulkPurchaseForm projects={mockCarbonProjects} />
    </main>
  );
}
