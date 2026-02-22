"use client";

import { forwardRef, ChangeEvent } from "react";
import { Input } from "@/components/atoms/Input";
import { Text } from "@/components/atoms/Text";
import { PriceSuggestion } from "@/components/molecules/PriceSuggestion/PriceSuggestion";
import type { MarketPriceData } from "@/lib/types/listing";

interface PriceInputProps {
  marketPrice?: MarketPriceData;
  error?: string;
  onChange: (price: number) => void;
}

export const PriceInput = forwardRef<HTMLInputElement, PriceInputProps>(
  ({ marketPrice, error, onChange, ...props }, ref) => {
    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
      const value = parseFloat(e.target.value) || 0;
      onChange(value);
    };

    const quickPrices = marketPrice ? [
      { label: "Market", value: marketPrice.current },
      { label: "Below Market", value: marketPrice.current * 0.95 },
      { label: "Above Market", value: marketPrice.current * 1.05 },
    ] : [
      { label: "Conservative", value: 8.5 },
      { label: "Market Rate", value: 10.0 },
      { label: "Premium", value: 12.0 },
    ];

    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="price-input" className="block text-sm font-medium">
            Price per Credit (XLM)
          </label>
          
          {marketPrice && (
            <div className="p-3 bg-muted/50 rounded-lg">
              <Text variant="small" as="p" className="text-muted-foreground text-xs mb-1">
                Current Market Price: <span className="font-medium text-foreground">{marketPrice.current.toFixed(4)} XLM</span>
              </Text>
              <Text variant="small" as="p" className="text-muted-foreground text-xs">
                24h Range: {marketPrice.low24h.toFixed(4)} - {marketPrice.high24h.toFixed(4)} XLM
              </Text>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <Text variant="small" as="p" className="text-muted-foreground text-xs">
            Quick Price Selection:
          </Text>
          <div className="grid grid-cols-3 gap-2">
            {quickPrices.map((price) => (
              <PriceSuggestion
                key={price.label}
                label={price.label}
                value={price.value}
                onClick={() => onChange(price.value)}
              />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Input
            id="price-input"
            ref={ref}
            type="number"
            step="0.0001"
            min="0"
            placeholder="Enter custom price"
            onChange={handleChange}
            className={error ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""}
            aria-describedby={error ? "price-error" : undefined}
            {...props}
          />
          
          {error && (
            <Text variant="small" as="p" id="price-error" className="text-red-600 dark:text-red-400 text-xs">
              {error}
            </Text>
          )}
        </div>

        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
          <Text variant="small" as="h4" className="font-medium mb-1 text-xs">
            💡 Pricing Tips
          </Text>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>• Price competitively to attract buyers</li>
            <li>• Consider market trends and demand</li>
            <li>• Higher prices may take longer to sell</li>
          </ul>
        </div>
      </div>
    );
  }
);

PriceInput.displayName = "PriceInput";