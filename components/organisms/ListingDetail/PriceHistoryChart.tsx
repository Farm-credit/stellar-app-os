'use client';

import React from 'react';
import { PriceHistoryPoint } from '@/lib/types/marketplace';
import { Text } from '@/components/atoms/Text';

interface PriceHistoryChartProps {
  data: PriceHistoryPoint[];
}

export default function PriceHistoryChart({ data }: PriceHistoryChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-48 w-full items-center justify-center rounded-xl border border-white/10 bg-white/5">
        <Text variant="body" className="text-white/50">
          No price history available.
        </Text>
      </div>
    );
  }

  // A simple placeholder chart visualization using relative heights
  const prices = data.map((d) => d.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const range = maxPrice - minPrice || 1; // Prevent division by zero

  return (
    <div className="flex flex-col space-y-4 rounded-xl border border-white/10 bg-white/5 p-6">
      <Text variant="h4" className="text-white">Price History</Text>
      <div className="relative flex h-48 w-full items-end justify-between gap-2 pt-8">
        {data.map((point, index) => {
          const heightPercentage = 10 + ((point.price - minPrice) / range) * 90; // Min 10% height
          const date = new Date(point.date).toLocaleDateString(undefined, {
            month: 'short',
            year: 'numeric',
          });
          return (
            <div key={index} className="group relative flex w-full flex-col items-center justify-end">
              <div
                className="w-full rounded-t-sm bg-stellar-blue/50 transition-all group-hover:bg-stellar-blue"
                style={{ height: `${heightPercentage}%` }}
              />
              <div className="absolute -top-8 hidden rounded bg-black/80 px-2 py-1 text-xs text-white group-hover:block whitespace-nowrap z-10">
                ${point.price.toFixed(2)}
              </div>
              <div className="mt-2 text-[10px] text-white/50">{date}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
