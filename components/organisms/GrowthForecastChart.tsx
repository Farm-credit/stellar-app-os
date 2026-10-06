'use client';

import { useEffect, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartNoAxesCombined, LoaderCircle } from 'lucide-react';
import { Text } from '@/components/atoms/Text';
import type { Tree } from '@/lib/types/tree';
import type { GrowthProjection } from '@/lib/growth/growthTypes';

interface GrowthForecastChartProps {
  tree: Tree;
}

export function speciesToSlug(species: string): string {
  const knownSlugs: Record<string, string> = {
    'African Locust Bean': 'locust_bean',
  };
  if (knownSlugs[species]) return knownSlugs[species];

  return species
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, '')
    .trim()
    .replace(/[^a-z0-9]+/g, '-');
}

export function ageInYears(plantedAt?: string, now = new Date()): number {
  if (!plantedAt) return 0;
  const planted = new Date(plantedAt);
  if (Number.isNaN(planted.getTime()) || planted > now) return 0;
  return Math.floor((now.getTime() - planted.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

export function GrowthForecastChart({ tree }: GrowthForecastChartProps) {
  const [projection, setProjection] = useState<GrowthProjection | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setHasError(false);

    fetch(
      `/api/planting/growth-projection?speciesSlug=${encodeURIComponent(speciesToSlug(tree.species))}`,
      { signal: controller.signal }
    )
      .then(async (response) => {
        if (!response.ok) throw new Error('Growth forecast unavailable');
        return (await response.json()) as GrowthProjection;
      })
      .then(setProjection)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setHasError(true);
      })
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, [tree.species]);

  return (
    <section
      className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800/60"
      aria-label={`Growth forecast for ${tree.species}`}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ChartNoAxesCombined className="h-4 w-4 text-stellar-green" aria-hidden />
          <Text className="text-xs font-bold">Growth forecast</Text>
        </div>
        <Text variant="muted" className="text-[10px]">
          Projected CO₂ / year
        </Text>
      </div>

      {isLoading && (
        <div
          className="flex h-32 items-center justify-center rounded-xl bg-slate-50/70 dark:bg-slate-800/30"
          role="status"
        >
          <LoaderCircle className="h-5 w-5 animate-spin text-stellar-green" aria-label="Loading growth forecast" />
        </div>
      )}
      {hasError && (
        <Text variant="muted" className="rounded-xl bg-slate-50/70 p-4 text-center text-xs dark:bg-slate-800/30">
          Forecast unavailable for this tree.
        </Text>
      )}
      {projection && !hasError && (
        <div
          className="h-32"
          role="img"
          aria-label={`${tree.species} projected CO₂ growth over ${projection.horizonYears} years`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={projection.curve} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id={`growth-${tree.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00b36b" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#00b36b" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.1} />
              <XAxis dataKey="year" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10 }} width={30} />
              <Tooltip
                formatter={(value) => [`${Number(value).toFixed(1)} kg`, 'Annual CO₂']}
                labelFormatter={(year) => `Year ${year}`}
              />
              <Area
                type="monotone"
                dataKey="annualCo2RateKg"
                stroke="#00b36b"
                fill={`url(#growth-${tree.id})`}
                strokeWidth={2}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
          <Text variant="muted" className="mt-1 text-[10px]">
            Current age: {ageInYears(tree.plantedAt)} years · FAO/IPCC projection
          </Text>
        </div>
      )}
    </section>
  );
}