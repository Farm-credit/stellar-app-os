'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Building2, Check, Leaf, Plane, RotateCcw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import {
  AIR_TRAVEL_EMISSIONS_KG_PER_PASSENGER_KM,
  CREDIT_PRICE_USD,
  EMPLOYEE_EMISSIONS_TONNES,
  calculateCarbonOffset,
  type CalculationMode,
} from './carbonOffsetCalculations';

const DEFAULT_VALUES: Record<CalculationMode, number> = {
  employees: 250,
  travel: 100_000,
};

const MODE_OPTIONS = [
  {
    id: 'employees' as const,
    label: 'By workforce',
    description: 'Estimate office, energy and commuting emissions',
    icon: Building2,
  },
  {
    id: 'travel' as const,
    label: 'By business travel',
    description: 'Estimate emissions from annual air travel',
    icon: Plane,
  },
];

export function CarbonOffsetCalculator() {
  const [mode, setMode] = useState<CalculationMode>('employees');
  const [values, setValues] = useState(DEFAULT_VALUES);
  const activeValue = values[mode];
  const estimate = useMemo(() => calculateCarbonOffset(mode, activeValue), [mode, activeValue]);
  const hasChanges =
    values.employees !== DEFAULT_VALUES.employees || values.travel !== DEFAULT_VALUES.travel;
  const slider =
    mode === 'employees'
      ? { min: 0, max: 10_000, step: 10, unit: 'employees' }
      : { min: 0, max: 2_000_000, step: 5_000, unit: 'passenger-km / year' };
  const percentage = ((activeValue - slider.min) / (slider.max - slider.min)) * 100;

  const updateValue = (value: number) => {
    setValues((current) => ({ ...current, [mode]: value }));
  };

  return (
    <section
      aria-labelledby="carbon-calculator-title"
      className="relative isolate overflow-hidden rounded-3xl border border-stellar-blue/20 bg-stellar-navy px-4 py-6 text-white shadow-2xl shadow-stellar-blue/10 sm:px-7 sm:py-8 lg:px-10"
    >
      <div
        aria-hidden="true"
        className="absolute -right-24 -top-32 -z-10 h-80 w-80 rounded-full bg-stellar-blue/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-40 -left-24 -z-10 h-80 w-80 rounded-full bg-stellar-purple/25 blur-3xl"
      />

      <div className="mb-8 max-w-2xl">
        <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-stellar-green/30 bg-stellar-green/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-stellar-green">
          <Leaf className="h-3.5 w-3.5" aria-hidden="true" />
          Enterprise planning tool
        </span>
        <h2 id="carbon-calculator-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
          Turn your footprint into a climate plan
        </h2>
        <p className="mt-3 text-sm leading-6 text-white/65 sm:text-base">
          Get an annual carbon-credit estimate from your workforce or business travel in seconds.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-4 backdrop-blur-sm sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2" aria-label="Calculation method">
            {MODE_OPTIONS.map((option) => {
              const Icon = option.icon;
              const selected = mode === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setMode(option.id)}
                  className={`group rounded-xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-stellar-navy active:scale-[0.98] ${
                    selected
                      ? 'border-stellar-blue bg-stellar-blue/15 shadow-lg shadow-stellar-blue/10'
                      : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.07]'
                  }`}
                >
                  <span className="flex items-start gap-3">
                    <span
                      className={`rounded-lg p-2 ${selected ? 'bg-stellar-blue text-stellar-navy' : 'bg-white/10 text-white/65 group-hover:text-white'}`}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span>
                      <span className="block font-semibold">{option.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-white/55">
                        {option.description}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <label htmlFor="carbon-offset-input" className="text-sm font-medium text-white/75">
                {mode === 'employees' ? 'Company size' : 'Annual flight distance'}
              </label>
              <output
                htmlFor="carbon-offset-input"
                className="text-2xl font-bold tabular-nums text-stellar-cyan sm:text-3xl"
                aria-live="polite"
              >
                {activeValue.toLocaleString()}{' '}
                <span className="text-xs font-medium text-white/55 sm:text-sm">{slider.unit}</span>
              </output>
            </div>
            <input
              id="carbon-offset-input"
              type="range"
              min={slider.min}
              max={slider.max}
              step={slider.step}
              value={activeValue}
              onChange={(event) => updateValue(Number(event.target.value))}
              aria-describedby="carbon-offset-assumption"
              className="mt-5 h-2 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-stellar-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-cyan focus-visible:ring-offset-4 focus-visible:ring-offset-stellar-navy disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                background: `linear-gradient(to right, var(--stellar-blue) ${percentage}%, rgba(255,255,255,.15) ${percentage}%)`,
              }}
            />
            <div className="mt-2 flex justify-between text-xs text-white/40" aria-hidden="true">
              <span>{slider.min.toLocaleString()}</span>
              <span>{slider.max.toLocaleString()}</span>
            </div>
            <p id="carbon-offset-assumption" className="mt-5 text-xs leading-5 text-white/50">
              {mode === 'employees'
                ? `Planning estimate: ${EMPLOYEE_EMISSIONS_TONNES} tCO₂e per employee annually, covering typical office energy and commuting.`
                : `Planning estimate: ${AIR_TRAVEL_EMISSIONS_KG_PER_PASSENGER_KM} kgCO₂e per passenger-km for mixed-haul air travel.`}
            </p>
          </div>

          <Button
            type="button"
            variant="ghost"
            disabled={!hasChanges}
            onClick={() => setValues(DEFAULT_VALUES)}
            className="mt-5 gap-2 text-white/60 hover:bg-white/10 hover:text-white focus-visible:ring-stellar-cyan disabled:opacity-35"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Reset estimates
          </Button>
        </div>

        <aside
          aria-label="Carbon offset estimate"
          className="flex flex-col rounded-2xl border border-stellar-green/25 bg-gradient-to-b from-stellar-green/15 to-white/[0.04] p-5 sm:p-6"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-stellar-green">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            Recommended annual coverage
          </div>
          <div className="mt-6" aria-live="polite" aria-atomic="true">
            <p className="text-5xl font-bold tracking-tight tabular-nums">
              {estimate.credits.toLocaleString()}
            </p>
            <p className="mt-1 text-sm text-white/60">verified carbon credits</p>
          </div>

          <dl className="my-7 space-y-3 border-y border-white/10 py-5 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-white/55">Estimated emissions</dt>
              <dd className="font-medium tabular-nums">
                {estimate.emissionsTonnes.toLocaleString(undefined, { maximumFractionDigits: 1 })}{' '}
                tCO₂e
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-white/55">Planning buffer</dt>
              <dd className="font-medium">10%</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-white/55">Estimated investment</dt>
              <dd className="font-medium tabular-nums">
                ${estimate.estimatedCostUsd.toLocaleString()} USD
              </dd>
            </div>
          </dl>

          <ul className="mb-7 space-y-2 text-xs text-white/60">
            <li className="flex gap-2">
              <Check
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stellar-green"
                aria-hidden="true"
              />
              One credit represents one tonne of CO₂e
            </li>
            <li className="flex gap-2">
              <Check
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stellar-green"
                aria-hidden="true"
              />
              Indicative price of ${CREDIT_PRICE_USD} per verified credit
            </li>
          </ul>

          {estimate.credits > 0 ? (
            <Button
              asChild
              stellar="success"
              width="full"
              className="mt-auto min-h-11 gap-2 font-semibold"
            >
              <Link href={`/credits/purchase/bulk?quantity=${estimate.credits}`}>
                Build an offset portfolio
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          ) : (
            <Button
              disabled
              stellar="success"
              width="full"
              className="mt-auto min-h-11 gap-2 font-semibold"
            >
              Build an offset portfolio
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
          <p className="mt-3 text-center text-[11px] leading-4 text-white/40">
            A planning estimate, not a certified greenhouse-gas inventory.
          </p>
        </aside>
      </div>
    </section>
  );
}
