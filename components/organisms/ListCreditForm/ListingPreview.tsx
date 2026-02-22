// components/organisms/ListCreditForm/ListingPreview.tsx
import React from 'react';
import { ListingDetails } from '@/lib/types'; // Mock type

interface ListingPreviewProps {
  details: ListingDetails;
}

const ListingPreview: React.FC<ListingPreviewProps> = ({ details }) => {
  return (
    <div className="p-5 border border-primary rounded-lg bg-white/10 dark:bg-white/5 mb-4">
      <h3 className="text-xl font-semibold mb-3 text-primary dark:text-secondary">Listing Summary</h3>
      
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-foreground/80 dark:text-white/80">Asset:</dt>
          <dd className="font-medium text-foreground dark:text-white">{details.assetName}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-foreground/80 dark:text-white/80">Quantity:</dt>
          <dd className="font-medium text-foreground dark:text-white">{details.quantity}</dd>
        </div>
        <div className="flex justify-between border-t border-foreground/20 pt-2">
          <dt className="text-foreground/80 dark:text-white/80">Price (Total):</dt>
          <dd className="font-bold text-lg text-primary dark:text-secondary">
             {details.totalValue.toFixed(4)} XLM/USD Equivalent
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-foreground/80 dark:text-white/80">Estimated Network Fee:</dt>
          <dd className="text-foreground/80 dark:text-white/80">{details.estimatedFee.toFixed(5)}</dd>
        </div>
        <div className="flex justify-between border-t border-foreground/20 pt-2">
          <dt className="text-lg font-bold text-green-500">Net Payout:</dt>
          <dd className="text-lg font-bold text-green-500">{details.netPayout.toFixed(4)}</dd>
        </div>
      </dl>
    </div>
  );
};

export default ListingPreview;