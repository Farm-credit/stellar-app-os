"use client";

import { forwardRef } from "react";
import { Input } from "@/components/atoms/Input";
import { Button } from "@/components/atoms/Button";
import { Text } from "@/components/atoms/Text";

interface QuantityInputProps {
  maxQuantity: number;
  error?: string;
  onChange: (quantity: number) => void;
  value?: number;
}

export const QuantityInput = forwardRef<HTMLInputElement, QuantityInputProps>(
  ({ maxQuantity, error, onChange, value }, ref) => {
    const quickAmounts = maxQuantity > 0 ? [
      Math.ceil(maxQuantity * 0.25),
      Math.ceil(maxQuantity * 0.5),
      Math.ceil(maxQuantity * 0.75),
      maxQuantity,
    ].filter((amount, index, arr) => arr.indexOf(amount) === index) : [];

    return (
      <div className="space-y-3">
        <label htmlFor="quantity-input" className="block text-sm font-medium">
          Quantity to List
        </label>
        
        {maxQuantity > 0 && (
          <div className="space-y-3 p-4 rounded-lg bg-muted/50">
            <Text variant="small" as="p" className="text-muted-foreground">
              Available: {maxQuantity} credits
            </Text>
            <div className="flex gap-2 flex-wrap">
              {quickAmounts.map((amount) => (
                <Button
                  key={amount}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onChange(amount)}
                  className="text-xs"
                >
                  {amount === maxQuantity ? 'All' : amount}
                </Button>
              ))}
            </div>
          </div>
        )}
        
        <div className="space-y-2">
          <Input
            id="quantity-input"
            ref={ref}
            type="number"
            min="1"
            max={maxQuantity}
            value={value || ''}
            onChange={(e) => onChange(Number(e.target.value))}
            placeholder="Enter quantity to list"
            className={error ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""}
            aria-describedby={error ? "quantity-error" : undefined}
          />
          
          {error && (
            <Text variant="small" as="p" id="quantity-error" className="text-red-600 dark:text-red-400">
              {error}
            </Text>
          )}
        </div>
      </div>
    );
  }
);

QuantityInput.displayName = "QuantityInput";