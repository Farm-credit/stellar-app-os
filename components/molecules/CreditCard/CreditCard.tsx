// components/molecules/CreditCard/CreditCard.tsx
"use client";

import { Button } from "@/components/atoms/Button";
import { Badge } from "@/components/atoms/Badge";
import { Text } from "@/components/atoms/Text";
import { cn } from "@/lib/utils";
import type { Credit } from "@/lib/types/listing";

interface CreditCardProps {
  credit: Credit;
  isSelected?: boolean;
  onClick?: () => void;
  showAmount?: boolean;
  className?: string;
}

export function CreditCard({
  credit,
  isSelected = false,
  onClick,
  showAmount = false,
  className,
}: CreditCardProps) {
  return (
    <div
      className={cn(
        "p-4 rounded-lg border transition-all cursor-pointer",
        isSelected 
          ? "border-stellar-blue bg-stellar-blue/10 dark:bg-stellar-blue/5" 
          : "border-border hover:border-stellar-blue/50",
        className
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Text variant="small" as="h3" className="font-semibold truncate">
              {credit.type}
            </Text>
            <Badge variant="outline" className="text-xs">
              {credit.vintage}
            </Badge>
          </div>
          
          <Text variant="small" as="p" className="text-muted-foreground mb-1 text-xs">
            {credit.metadata.projectName}
          </Text>
          
          <Text variant="small" as="p" className="text-muted-foreground text-xs">
            {credit.metadata.location}
          </Text>
          
          {showAmount && (
            <div className="mt-2 pt-2 border-t border-border">
              <Text variant="small" as="p" className="text-muted-foreground text-xs">
                Available: <span className="font-medium text-foreground">{credit.amount} credits</span>
              </Text>
            </div>
          )}
        </div>
        
        {isSelected && (
          <div className="ml-2 w-5 h-5 rounded-full bg-stellar-blue flex items-center justify-center">
            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}