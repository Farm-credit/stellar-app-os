"use client";

import { Button } from "@/components/atoms/Button";
import { Text } from "@/components/atoms/Text";

interface PriceSuggestionProps {
  label: string;
  value: number;
  onClick: () => void;
}

export function PriceSuggestion({ label, value, onClick }: PriceSuggestionProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      className="flex flex-col items-center p-3 h-auto border-stellar-blue/20 hover:border-stellar-blue hover:bg-stellar-blue/5"
    >
      <Text variant="small" as="span" className="text-muted-foreground text-xs">
        {label}
      </Text>
      <Text variant="small" as="span" className="font-mono font-semibold">
        {value.toFixed(4)} XLM
      </Text>
    </Button>
  );
}