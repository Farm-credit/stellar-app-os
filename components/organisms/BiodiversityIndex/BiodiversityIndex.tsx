'use client';

/**
 * BiodiversityIndex Component - Issue #1693
 *
 * Displays Shannon Diversity Index for reforestation projects with:
 * - Current biodiversity index with plain-language explanation
 * - Comparison to baseline biodiversity at project start
 * - Annual trend visualization
 * - Species composition breakdown
 */

import { Leaf, TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';
import { Text } from '@/components/atoms/Text';
import { Badge } from '@/components/atoms/Badge';
import {
  calculateShannonIndex,
  compareBiodiversity,
  calculateBiodiversityTrend,
  type SpeciesCount,
  type BiodiversityComparison,
  type BiodiversityTrend,
  type AnnualCensusData,
} from '@/lib/biodiversity/shannon-index';

interface BiodiversityIndexProps {
  currentSpecies: SpeciesCount[];
  baselineSpecies: SpeciesCount[];
  annualCensus?: AnnualCensusData[];
  className?: string;
}

export function BiodiversityIndex({
  currentSpecies,
  baselineSpecies,
  annualCensus = [],
  className,
}: BiodiversityIndexProps) {
  const currentIndex = calculateShannonIndex(currentSpecies);
  const baselineIndex = calculateShannonIndex(baselineSpecies);
  const comparison = compareBiodiversity(currentIndex, baselineIndex);
  const trend = annualCensus.length > 1 ? calculateBiodiversityTrend(annualCensus) : null;

  const getTrendIcon = () => {
    if (comparison.trend === 'improving') return <TrendingUp className="w-4 h-4 text-green-600" />;
    if (comparison.trend === 'declining') return <TrendingDown className="w-4 h-4 text-red-600" />;
    return <Minus className="w-4 h-4 text-gray-600" />;
  };

  const getTrendColor = () => {
    if (comparison.trend === 'improving') return 'text-green-600';
    if (comparison.trend === 'declining') return 'text-red-600';
    return 'text-gray-600';
  };

  const getBadgeVariant = () => {
    if (comparison.trend === 'improving') return 'default';
    if (comparison.trend === 'declining') return 'destructive';
    return 'outline';
  };

  return (
    <div className={className}>
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          <Leaf className="w-5 h-5 text-green-600" />
          <Text variant="h3" className="text-lg font-semibold">
            Forest Biodiversity Index
          </Text>
        </div>

        {/* Current Index Display */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <Text variant="body" className="font-medium">
              Shannon Diversity Index
            </Text>
            <Badge variant={getBadgeVariant()}>
              {comparison.trend.charAt(0).toUpperCase() + comparison.trend.slice(1)}
            </Badge>
          </div>
          
          <div className="flex items-baseline gap-2 mb-2">
            <Text variant="h2" className="text-3xl font-bold">
              {currentIndex.shannonIndex.toFixed(2)}
            </Text>
            <div className="flex items-center gap-1">
              {getTrendIcon()}
              <Text variant="small" className={getTrendColor()}>
                {comparison.change > 0 ? '+' : ''}{comparison.change.toFixed(1)}% vs baseline
              </Text>
            </div>
          </div>

          <Text variant="muted" className="text-sm">
            {currentIndex.interpretation}
          </Text>
        </div>

        {/* Biodiversity Metrics */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="p-3 rounded-lg bg-muted/50">
            <Text variant="small" className="text-muted-foreground mb-1">
              Species Richness
            </Text>
            <Text variant="h4" className="text-xl font-semibold">
              {currentIndex.speciesRichness}
            </Text>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <Text variant="small" className="text-muted-foreground mb-1">
              Total Trees
            </Text>
            <Text variant="h4" className="text-xl font-semibold">
              {currentIndex.totalIndividuals.toLocaleString()}
            </Text>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <Text variant="small" className="text-muted-foreground mb-1">
              Evenness
            </Text>
            <Text variant="h4" className="text-xl font-semibold">
              {currentIndex.evenness.toFixed(2)}
            </Text>
          </div>
        </div>

        {/* Baseline Comparison */}
        <div className="p-4 rounded-lg bg-blue-50 border border-blue-200 mb-6">
          <div className="flex items-start gap-2 mb-2">
            <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <Text variant="body" className="font-medium text-blue-900 mb-1">
                Comparison to Baseline
              </Text>
              <Text variant="small" className="text-blue-700">
                {comparison.summary}
              </Text>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-3 text-sm">
            <div>
              <Text variant="small" className="text-blue-600">
                Baseline: {baselineIndex.shannonIndex.toFixed(2)}
              </Text>
            </div>
            <div>
              <Text variant="small" className="text-blue-600">
                Current: {currentIndex.shannonIndex.toFixed(2)}
              </Text>
            </div>
          </div>
        </div>

        {/* Species Composition */}
        <div className="mb-6">
          <Text variant="body" className="font-medium mb-3">
            Species Composition
          </Text>
          <div className="space-y-2">
            {currentSpecies.slice(0, 5).map((species) => {
              const proportion = (species.count / currentIndex.totalIndividuals) * 100;
              return (
                <div key={species.speciesId} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex justify-between text-sm mb-1">
                      <Text variant="body">{species.speciesName}</Text>
                      <Text variant="small" className="text-muted-foreground">
                        {proportion.toFixed(1)}%
                      </Text>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-600 rounded-full transition-all"
                        style={{ width: `${proportion}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            {currentSpecies.length > 5 && (
              <Text variant="small" className="text-muted-foreground">
                +{currentSpecies.length - 5} more species
              </Text>
            )}
          </div>
        </div>

        {/* Annual Trend */}
        {trend && trend.years.length > 1 && (
          <div>
            <Text variant="body" className="font-medium mb-3">
              Annual Biodiversity Trend
            </Text>
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="flex items-center justify-between mb-2">
                <Text variant="small" className="text-muted-foreground">
                  Average Annual Change
                </Text>
                <Badge variant={trend.trend === 'increasing' ? 'default' : trend.trend === 'decreasing' ? 'destructive' : 'outline'}>
                  {trend.trend.charAt(0).toUpperCase() + trend.trend.slice(1)}
                </Badge>
              </div>
              <Text variant="h4" className="text-2xl font-semibold mb-3">
                {trend.averageChange > 0 ? '+' : ''}{trend.averageChange.toFixed(2)}%
              </Text>
              <div className="flex items-end gap-1 h-16">
                {trend.indices.map((index, i) => {
                  const maxIndex = Math.max(...trend.indices);
                  const height = maxIndex > 0 ? (index / maxIndex) * 100 : 0;
                  return (
                    <div
                      key={trend.years[i]}
                      className="flex-1 flex flex-col items-center gap-1"
                    >
                      <div
                        className="w-full bg-green-600 rounded-t transition-all"
                        style={{ height: `${height}%` }}
                      />
                      <Text variant="small" className="text-xs text-muted-foreground">
                        {trend.years[i]}
                      </Text>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Explanation */}
        <div className="mt-6 p-4 rounded-lg bg-gray-50 border border-gray-200">
          <Text variant="body" className="font-medium mb-2">
            What is the Shannon Diversity Index?
          </Text>
          <Text variant="small" className="text-muted-foreground leading-relaxed">
            The Shannon Diversity Index measures both the number of species (richness) and how evenly
            individuals are distributed among species (evenness). Higher values (typically 1.5-3.5 for
            forests) indicate greater biodiversity. This index is updated annually with field census data
            to track ecosystem health over time.
          </Text>
        </div>
      </div>
    </div>
  );
}
