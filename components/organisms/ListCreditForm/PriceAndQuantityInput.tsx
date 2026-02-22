// components/organisms/ListCreditForm/PriceAndQuantityInput.tsx
import React from 'react';
import { CreditAsset } from '@/lib/types'; // Mock type

interface PriceAndQuantityInputProps {
  asset: CreditAsset | undefined;
  quantity: number;
  onQuantityChange: (qty: number) => void;
  price: number;
  onPriceChange: (price: number) => void;
  ownedQuantity: number;
}

const PriceAndQuantityInput: React.FC<PriceAndQuantityInputProps> = ({
  asset,
  quantity,
  onQuantityChange,
  price,
  onPriceChange,
  ownedQuantity,
}) => {
  
  // Placeholder: Fetching market price based on asset (should be done in parent)
  const marketSuggestion = asset ? 0.55 : undefined; 

  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = Number(e.target.value);
    if (isNaN(value) || value < 0) value = 0;
    // Prevent listing more than owned
    if (value > ownedQuantity) value = ownedQuantity;
    onQuantityChange(value);
  };

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = Number(e.target.value);
    if (isNaN(value) || value < 0) value = 0;
    onPriceChange(value);
  };

  return (
    <div className="grid grid-cols-2 gap-4 mt-4">
      {/* Quantity Input */}
      <div>
        <label htmlFor="quantity" className="block text-sm font-medium text-foreground/80 dark:text-white/80 mb-1">
          Quantity
        </label>
        <input
          id="quantity"
          type="number"
          value={quantity === 0 ? '' : quantity}
          onChange={handleQuantityChange}
          min="0"
          max={ownedQuantity}
          placeholder="e.g., 100"
          disabled={ownedQuantity === 0}
          className="w-full p-3 border border-foreground/30 rounded-lg bg-white/10 dark:bg-white/10 text-foreground dark:text-white disabled:opacity-50"
        />
        {ownedQuantity > 0 && (
            <p className="text-xs mt-1 text-foreground/60 dark:text-white/60">Max: {ownedQuantity}</p>
        )}
        {ownedQuantity === 0 && (
             <p className="text-xs mt-1 text-red-500">You own 0 of this asset.</p>
        )}
      </div>

      {/* Price Input */}
      <div>
        <div className="flex justify-between items-baseline mb-1">
          <label htmlFor="price" className="text-sm font-medium text-foreground/80 dark:text-white/80">
            Price per Credit
          </label>
          {marketSuggestion !== undefined && price === marketSuggestion && (
             <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded">Suggested</span>
          )}
        </div>
        <input
          id="price"
          type="number"
          step="0.0001"
          value={price === 0 ? '' : price}
          onChange={handlePriceChange}
          min="0.000001"
          placeholder={marketSuggestion ? marketSuggestion.toFixed(4).toString() : "0.0000"}
          disabled={ownedQuantity === 0}
          className="w-full p-3 border border-foreground/30 rounded-lg bg-white/10 dark:bg-white/10 text-foreground dark:text-white disabled:opacity-50"
        />
        {marketSuggestion !== undefined && price !== marketSuggestion && (
             <p className="text-xs mt-1 text-foreground/60 dark:text-white/60">Market: {marketSuggestion.toFixed(4)}</p>
        )}
      </div>
    </div>
  );
};

export default PriceAndQuantityInput;