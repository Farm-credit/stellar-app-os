'use client';

import { useState, useMemo, useId } from 'react';
import { Leaf, Droplets, MapPin, Wind, Info } from 'lucide-react';
import { Select } from '@/components/atoms/Select';
import { Input } from '@/components/atoms/Input';
import { Text } from '@/components/atoms/Text';
import { Badge } from '@/components/atoms/Badge';
import { cn } from '@/lib/utils';
import { type TreeSpecies } from '@/lib/types/tree-impact';
import {
  calculateTreeImpact,
  formatLargeNumber,
  TREE_SPECIES_DATA,
} from '@/lib/utils/treeImpactCalculations';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SPECIES_LABELS: Record<TreeSpecies, string> = {
  teak: 'Teak',
  moringa: 'Moringa',
  eucalyptus: 'Eucalyptus',
  mangrove: 'Mangrove',
  oak: 'Oak',
  pine: 'Pine',
  acacia: 'Acacia',
  bamboo: 'Bamboo',
};

const YEAR_OPTIONS = [1, 5, 10, 25, 50] as const;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  equivalent: string;
  colorClass: string;
  bgClass: string;
}

function MetricCard({
  icon,
  label,
  value,
  unit,
  equivalent,
  colorClass,
  bgClass,
}: MetricCardProps) {
  return (
    <article
      className={cn(
        'flex flex-col gap-3 rounded-xl border p-5 shadow-sm transition-all hover:shadow-md',
        bgClass
      )}
    >
      <div className={cn('flex items-center gap-2', colorClass)} aria-hidden="true">
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold tracking-tight text-foreground">
          {value}
          <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>
        </p>
        <p className="mt-0.5 text-sm font-medium text-muted-foreground">{label}</p>
      </div>
      <p className={cn('text-xs font-medium', colorClass)}>{equivalent}</p>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface TreeImpactDetailsProps {
  /** Initial species selection. Defaults to 'oak'. */
  defaultSpecies?: TreeSpecies;
  /** Initial tree count. Defaults to 10. */
  defaultTreeCount?: number;
  /** Initial year horizon. Defaults to 10. */
  defaultYears?: number;
  className?: string;
}

export function TreeImpactDetails({
  defaultSpecies = 'oak',
  defaultTreeCount = 10,
  defaultYears = 10,
  className,
}: TreeImpactDetailsProps) {
  const [species, setSpecies] = useState<TreeSpecies>(defaultSpecies);
  const [treeCount, setTreeCount] = useState<number>(defaultTreeCount);
  const [years, setYears] = useState<number>(defaultYears);

  const speciesId = useId();
  const yearsId = useId();
  const treeCountId = useId();

  const result = useMemo(
    () => calculateTreeImpact(species, treeCount, years),
    [species, treeCount, years]
  );

  const speciesInfo = TREE_SPECIES_DATA[species];

  // Safe tree count handler — clamp between 1 and 10,000
  function handleTreeCountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = parseInt(e.target.value, 10);
    if (!isNaN(raw)) {
      setTreeCount(Math.min(10_000, Math.max(1, raw)));
    }
  }

  // Equivalency strings
  const co2Cars = result.co2EquivalentCars;
  const co2CarsLabel =
    co2Cars >= 1
      ? `≈ ${co2Cars.toFixed(1)} car${co2Cars !== 1 ? 's' : ''} taken off the road`
      : `≈ ${(co2Cars * 365).toFixed(0)} days of driving avoided`;

  const showersLabel =
    result.waterEquivalentShowers >= 1000
      ? `≈ ${formatLargeNumber(result.waterEquivalentShowers)} showers worth of water`
      : `≈ ${Math.round(result.waterEquivalentShowers)} showers worth of water`;

  const habitatLabel = `≈ ${result.totalHabitat.toLocaleString()} m² of habitat restored`;

  const oxygenBreaths =
    result.totalOxygen >= 1000
      ? `≈ ${formatLargeNumber(result.totalOxygen * 1000)} breaths of oxygen`
      : `≈ ${Math.round(result.totalOxygen * 1000).toLocaleString()} breaths of oxygen`;

  return (
    <section
      className={cn('rounded-2xl border bg-card shadow-sm', className)}
      aria-labelledby="tree-impact-heading"
    >
      {/* Header */}
      <div className="border-b px-6 py-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-stellar-green/10">
            <Leaf className="h-5 w-5 text-stellar-green" aria-hidden="true" />
          </div>
          <div>
            <h2
              id="tree-impact-heading"
              className="text-lg font-semibold tracking-tight text-foreground"
            >
              Per-Tree Environmental Impact
            </h2>
            <Text variant="small" className="text-muted-foreground">
              Explore the real-world ecological benefits of each tree species
            </Text>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="grid gap-5 border-b px-6 py-5 sm:grid-cols-3">
        {/* Species selector */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={speciesId} className="text-sm font-medium text-foreground">
            Tree species
          </label>
          <Select
            id={speciesId}
            variant="success"
            value={species}
            onChange={(e) => setSpecies(e.target.value as TreeSpecies)}
            aria-label="Select tree species"
          >
            {(Object.keys(SPECIES_LABELS) as TreeSpecies[]).map((s) => (
              <option key={s} value={s}>
                {SPECIES_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>

        {/* Tree count */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={treeCountId} className="text-sm font-medium text-foreground">
            Number of trees
          </label>
          <Input
            id={treeCountId}
            type="number"
            variant="primary"
            min={1}
            max={10000}
            value={treeCount}
            onChange={handleTreeCountChange}
            aria-label="Number of trees to calculate impact for"
          />
        </div>

        {/* Year slider */}
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm font-medium text-foreground">
            Time horizon:{' '}
            <span className="text-stellar-blue" aria-live="polite">
              {years} {years === 1 ? 'year' : 'years'}
            </span>
          </legend>
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-labelledby={yearsId}
            id={yearsId}
          >
            {YEAR_OPTIONS.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => setYears(y)}
                aria-pressed={years === y}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue',
                  years === y
                    ? 'border-stellar-blue bg-stellar-blue text-white'
                    : 'border-input bg-background text-muted-foreground hover:border-stellar-blue/50 hover:text-foreground'
                )}
              >
                {y}yr
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      {/* Species info banner */}
      <div className="flex flex-wrap items-start gap-3 border-b bg-stellar-green/5 px-6 py-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-stellar-green" aria-hidden="true" />
        <div className="flex-1">
          <p className="text-sm text-foreground">{speciesInfo.description}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge variant="success" aria-label={`Matures in ${speciesInfo.maturityYears} years`}>
              Matures in {speciesInfo.maturityYears}yr
            </Badge>
            <Badge
              variant="default"
              aria-label={`Biodiversity score: ${speciesInfo.biodiversityScore} out of 100`}
            >
              Biodiversity {speciesInfo.biodiversityScore}/100
            </Badge>
            {speciesInfo.nativeTo.slice(0, 2).map((region) => (
              <Badge key={region} variant="secondary">
                {region}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid gap-4 px-6 py-5 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={<Leaf className="h-5 w-5" />}
          label={`CO₂ sequestered over ${years}yr`}
          value={formatLargeNumber(result.totalCO2)}
          unit="kg CO₂"
          equivalent={co2CarsLabel}
          colorClass="text-stellar-green"
          bgClass="border-stellar-green/20 bg-stellar-green/5"
        />
        <MetricCard
          icon={<Droplets className="h-5 w-5" />}
          label={`Water conserved over ${years}yr`}
          value={formatLargeNumber(result.totalWater)}
          unit="litres"
          equivalent={showersLabel}
          colorClass="text-stellar-blue"
          bgClass="border-stellar-blue/20 bg-stellar-blue/5"
        />
        <MetricCard
          icon={<MapPin className="h-5 w-5" />}
          label="Habitat restored"
          value={result.totalHabitat.toLocaleString()}
          unit="m²"
          equivalent={habitatLabel}
          colorClass="text-stellar-purple"
          bgClass="border-stellar-purple/20 bg-stellar-purple/5"
        />
        <MetricCard
          icon={<Wind className="h-5 w-5" />}
          label={`Oxygen produced over ${years}yr`}
          value={formatLargeNumber(result.totalOxygen)}
          unit="kg O₂"
          equivalent={oxygenBreaths}
          colorClass="text-stellar-cyan"
          bgClass="border-stellar-cyan/20 bg-stellar-cyan/5"
        />
      </div>

      {/* Summary row */}
      <div className="rounded-b-2xl border-t bg-muted/30 px-6 py-4">
        <p className="text-center text-xs text-muted-foreground">
          Data sourced from FAO/IPCC Tier 1 biomass growth tables. Values are projections based on
          average conditions and are updated annually. Habitat is non-cumulative — it represents
          area restored per tree.
        </p>
      </div>
    </section>
  );
}

TreeImpactDetails.displayName = 'TreeImpactDetails';
