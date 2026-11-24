'use client';

/**
 * ForestRegenerationSimulation
 *
 * Implements issue #1710 — interactive forest regeneration simulation visualisation.
 * Shows projected canopy growth and cumulative CO₂ sequestration over 10, 25, and
 * 50-year horizons using peer-reviewed FAO/IPCC logistic growth models per species
 * and climate zone.
 *
 * Acceptance criteria:
 *   ✓ Time slider animating projected canopy growth
 *   ✓ CO₂ cumulative curve chart alongside simulation
 *   ✓ Based on peer-reviewed growth models per species and climate zone
 */

import { useMemo, useState, useCallback, type JSX } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { TreePine, Wind, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Text } from '@/components/atoms/Text';
import {
  runForestSimulation,
  getMilestoneSnapshots,
  type ClimateZone,
  type ForestSimulationResult,
} from '@/lib/growth/forestSimulation';

interface ForestRegenerationSimulationProps {
  /** Primary tree species planted in the project. */
  species: string;
  /** Climate zone of the project location. */
  climateZone?: ClimateZone;
  className?: string;
}

const HORIZON_OPTIONS = [10, 25, 50] as const;
type HorizonYears = (typeof HORIZON_OPTIONS)[number];

const CLIMATE_ZONE_LABELS: Record<ClimateZone, string> = {
  Tropical: 'Tropical',
  Subtropical: 'Subtropical',
  Temperate: 'Temperate',
  Boreal: 'Boreal',
  Arid: 'Arid / Semi-Arid',
};

function MilestoneCard({
  year,
  canopyPercent,
  cumulativeCo2,
  isCurrent,
}: {
  year: number;
  canopyPercent: number;
  cumulativeCo2: number;
  isCurrent: boolean;
}): JSX.Element {
  return (
    <div
      className={cn(
        'rounded-lg border p-3 text-center transition-all',
        isCurrent
          ? 'border-stellar-green bg-stellar-green/10'
          : 'border-border bg-card'
      )}
    >
      <p className="text-xs font-medium text-muted-foreground">Year {year}</p>
      <p className="text-lg font-bold text-stellar-green">{canopyPercent}%</p>
      <p className="text-xs text-muted-foreground">canopy</p>
      <p className="mt-1 text-sm font-semibold">{cumulativeCo2.toFixed(0)}</p>
      <p className="text-xs text-muted-foreground">t CO₂/ha</p>
    </div>
  );
}

export function ForestRegenerationSimulation({
  species,
  climateZone = 'Tropical',
  className,
}: ForestRegenerationSimulationProps): JSX.Element {
  const [horizonYears, setHorizonYears] = useState<HorizonYears>(50);
  const [sliderYear, setSliderYear] = useState<number>(0);
  const [activeZone, setActiveZone] = useState<ClimateZone>(climateZone);

  const simulation: ForestSimulationResult = useMemo(
    () => runForestSimulation(species, activeZone, horizonYears),
    [species, activeZone, horizonYears]
  );

  const milestones = useMemo(() => getMilestoneSnapshots(simulation), [simulation]);

  const currentPoint = useMemo(
    () => simulation.dataPoints.find((p) => p.year === sliderYear) ?? simulation.dataPoints[0],
    [simulation, sliderYear]
  );

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSliderYear(Number(e.target.value));
    },
    []
  );

  const handleHorizonChange = useCallback((h: HorizonYears) => {
    setHorizonYears(h);
    setSliderYear(0);
  }, []);

  return (
    <section
      className={cn(
        'mx-auto max-w-7xl space-y-6 rounded-2xl border border-border bg-card px-4 py-8 sm:px-8',
        className
      )}
      aria-labelledby="forest-sim-heading"
    >
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-stellar-green/10 p-2 text-stellar-green">
            <TreePine className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <Text variant="h4" as="h2" id="forest-sim-heading">
              Forest Regeneration Simulation
            </Text>
            <Text variant="muted" className="text-xs">
              Projected growth for <strong>{species}</strong> · {CLIMATE_ZONE_LABELS[activeZone]}{' '}
              climate · FAO/IPCC models
            </Text>
          </div>
        </div>

        {/* Horizon selector */}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted p-1" role="group" aria-label="Simulation horizon">
          {HORIZON_OPTIONS.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => handleHorizonChange(h)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue',
                horizonYears === h
                  ? 'bg-stellar-green text-white shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              aria-pressed={horizonYears === h}
            >
              {h} yr
            </button>
          ))}
        </div>
      </div>

      {/* ── Climate zone picker ── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <Wind className="h-3 w-3" aria-hidden /> Climate zone:
        </span>
        {(Object.keys(CLIMATE_ZONE_LABELS) as ClimateZone[]).map((zone) => (
          <button
            key={zone}
            type="button"
            onClick={() => setActiveZone(zone)}
            className={cn(
              'rounded-full border px-3 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue',
              activeZone === zone
                ? 'border-stellar-blue bg-stellar-blue/10 text-stellar-blue'
                : 'border-border text-muted-foreground hover:border-stellar-blue/50 hover:text-foreground'
            )}
            aria-pressed={activeZone === zone}
          >
            {zone}
          </button>
        ))}
      </div>

      {/* ── Milestone cards ── */}
      <div className="grid grid-cols-3 gap-3" aria-label="Projected milestones">
        {milestones.map(({ year, canopyPercent, cumulativeCo2TonsPerHa }) => (
          <MilestoneCard
            key={year}
            year={year}
            canopyPercent={canopyPercent}
            cumulativeCo2={cumulativeCo2TonsPerHa}
            isCurrent={sliderYear >= year}
          />
        ))}
      </div>

      {/* ── Time slider ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Text variant="small" className="font-semibold">
            Year{' '}
            <span className="text-stellar-green" aria-live="polite" aria-atomic="true">
              {sliderYear}
            </span>
          </Text>
          <div className="flex gap-4 text-sm">
            <span>
              Canopy:{' '}
              <strong className="text-stellar-green">
                {currentPoint?.canopyPercent ?? 0}%
              </strong>
            </span>
            <span>
              Cumulative CO₂:{' '}
              <strong className="text-stellar-blue">
                {currentPoint?.cumulativeCo2TonsPerHa ?? 0} t/ha
              </strong>
            </span>
          </div>
        </div>

        <input
          type="range"
          min={0}
          max={horizonYears}
          step={1}
          value={sliderYear}
          onChange={handleSliderChange}
          className="w-full accent-stellar-green"
          aria-label={`Simulation time slider — year ${sliderYear} of ${horizonYears}`}
          aria-valuemin={0}
          aria-valuemax={horizonYears}
          aria-valuenow={sliderYear}
          aria-valuetext={`Year ${sliderYear}: canopy ${currentPoint?.canopyPercent ?? 0}%`}
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Year 0</span>
          <span>Year {Math.floor(horizonYears / 2)}</span>
          <span>Year {horizonYears}</span>
        </div>
      </div>

      {/* ── Dual chart: canopy growth + cumulative CO₂ ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Canopy growth chart */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <TreePine className="h-4 w-4 text-stellar-green" aria-hidden />
            <Text variant="small" className="font-semibold">
              Projected Canopy Coverage
            </Text>
          </div>
          <div className="h-52" role="img" aria-label={`Canopy coverage chart for ${species} over ${horizonYears} years`}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={simulation.dataPoints}
                margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="canopyGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00b36b" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#00b36b" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.08} />
                <XAxis dataKey="year" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: number) => `${v}%`}
                  domain={[0, 100]}
                />
                <Tooltip
                  formatter={(value: number) => [`${value}%`, 'Canopy']}
                  labelFormatter={(year: number) => `Year ${year}`}
                />
                {sliderYear > 0 && (
                  <ReferenceLine x={sliderYear} stroke="#14b6e7" strokeDasharray="4 4" />
                )}
                <Area
                  type="monotone"
                  dataKey="canopyPercent"
                  stroke="#00b36b"
                  fill="url(#canopyGradient)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#00b36b' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cumulative CO₂ chart */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-stellar-blue" aria-hidden />
            <Text variant="small" className="font-semibold">
              Cumulative CO₂ Sequestration (t/ha)
            </Text>
          </div>
          <div className="h-52" role="img" aria-label={`Cumulative CO₂ sequestration chart over ${horizonYears} years`}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={simulation.dataPoints}
                margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="co2Gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#14b6e7" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#14b6e7" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.08} />
                <XAxis dataKey="year" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10 }} width={35} />
                <Tooltip
                  formatter={(value: number) => [`${value.toFixed(1)} t/ha`, 'Cumulative CO₂']}
                  labelFormatter={(year: number) => `Year ${year}`}
                />
                {sliderYear > 0 && (
                  <ReferenceLine x={sliderYear} stroke="#00b36b" strokeDasharray="4 4" />
                )}
                <Area
                  type="monotone"
                  dataKey="cumulativeCo2TonsPerHa"
                  stroke="#14b6e7"
                  fill="url(#co2Gradient)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: '#14b6e7' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <Text variant="muted" className="text-[10px]">
        Projections use IPCC Tier 1 default coefficients and logistic growth models (FAO/IPCC 2006).
        Actual outcomes vary by site conditions, management practices, and climate change trajectory.
      </Text>
    </section>
  );
}
