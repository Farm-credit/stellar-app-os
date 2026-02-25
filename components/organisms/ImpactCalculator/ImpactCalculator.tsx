'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  Plane,
  Car,
  Zap,
  Flame,
  Leaf,
  Drumstick,
  ShoppingBag,
  ArrowRight,
  ArrowLeft,
  Share2,
  Trees,
  BarChart3,
} from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { Badge } from '@/components/atoms/Badge';
import {
  type CalculatorStep,
  type TravelInput,
  type EnergyInput,
  type LifestyleInput,
  type DietType,
  DEFAULT_TRAVEL,
  DEFAULT_ENERGY,
  DEFAULT_LIFESTYLE,
} from '@/lib/types/impact-calculator';
import { calculateImpact } from '@/lib/utils/impactCalculations';

const STEPS: { id: CalculatorStep; label: string; icon: typeof Plane }[] = [
  { id: 'travel', label: 'Travel', icon: Plane },
  { id: 'energy', label: 'Energy', icon: Zap },
  { id: 'lifestyle', label: 'Lifestyle', icon: Leaf },
  { id: 'results', label: 'Results', icon: BarChart3 },
];

function StepIndicator({ currentStep }: { currentStep: CalculatorStep }) {
  const currentIndex = STEPS.findIndex((s) => s.id === currentStep);

  return (
    <nav aria-label="Calculator progress" className="mb-8">
      <ol role="list" className="flex items-center justify-between">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;

          return (
            <li key={step.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div
                  aria-current={isCurrent ? 'step' : undefined}
                  className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all ${
                    isCompleted
                      ? 'border-stellar-green bg-stellar-green text-white'
                      : isCurrent
                        ? 'border-stellar-blue bg-stellar-blue text-white ring-2 ring-stellar-blue/20'
                        : 'border-muted-foreground/30 bg-background text-muted-foreground'
                  }`}
                >
                  {isCompleted ? (
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  )}
                </div>
                <Text
                  variant="small"
                  className={`mt-2 text-xs font-medium transition-colors ${
                    isCompleted
                      ? 'text-stellar-green'
                      : isCurrent
                        ? 'text-stellar-blue'
                        : 'text-muted-foreground'
                  }`}
                >
                  {step.label}
                </Text>
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={`hidden sm:block h-0.5 flex-1 mx-2 transition-colors ${
                    index < currentIndex ? 'bg-stellar-green' : 'bg-muted-foreground/30'
                  }`}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  icon: Icon,
  unit,
  min = 0,
  max = 99999,
  id,
}: {
  label: string;
  value: number;
  onChange: (_val: number) => void; // eslint-disable-line no-unused-vars
  icon: typeof Plane;
  unit?: string;
  min?: number;
  max?: number;
  id: string;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 text-stellar-blue" aria-hidden="true" />
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          variant="primary"
          inputSize="md"
          value={value}
          min={min}
          max={max}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val) && val >= min && val <= max) {
              onChange(val);
            } else if (e.target.value === '') {
              onChange(0);
            }
          }}
          className="flex-1"
        />
        {unit && (
          <Text variant="muted" className="text-xs whitespace-nowrap">
            {unit}
          </Text>
        )}
      </div>
    </div>
  );
}

function TravelStep({
  travel,
  onChange,
}: {
  travel: TravelInput;
  onChange: (_t: TravelInput) => void; // eslint-disable-line no-unused-vars
}) {
  return (
    <div className="space-y-6">
      <div>
        <Text variant="h3" className="mb-2">
          Travel &amp; Transportation
        </Text>
        <Text variant="muted">Tell us about your annual travel habits.</Text>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <NumberInput
          id="short-flights"
          label="Short flights per year"
          value={travel.shortFlightsPerYear}
          onChange={(v) => onChange({ ...travel, shortFlightsPerYear: v })}
          icon={Plane}
          unit="round trips"
          max={100}
        />
        <NumberInput
          id="long-flights"
          label="Long flights per year"
          value={travel.longFlightsPerYear}
          onChange={(v) => onChange({ ...travel, longFlightsPerYear: v })}
          icon={Plane}
          unit="round trips"
          max={50}
        />
        <NumberInput
          id="car-miles"
          label="Car miles per week"
          value={travel.carMilesPerWeek}
          onChange={(v) => onChange({ ...travel, carMilesPerWeek: v })}
          icon={Car}
          unit="miles/week"
          max={5000}
        />
        <div className="space-y-2">
          <label htmlFor="transport-mode" className="flex items-center gap-2 text-sm font-medium">
            <Car className="h-4 w-4 text-stellar-blue" aria-hidden="true" />
            Primary transport
          </label>
          <Select
            id="transport-mode"
            variant="primary"
            value={travel.primaryTransport}
            onChange={(e) =>
              onChange({
                ...travel,
                primaryTransport: e.target.value as TravelInput['primaryTransport'],
              })
            }
          >
            <option value="car">Car</option>
            <option value="public">Public Transit</option>
            <option value="bike">Bicycle</option>
            <option value="walk">Walking</option>
          </Select>
        </div>
      </div>
    </div>
  );
}

function EnergyStep({
  energy,
  onChange,
}: {
  energy: EnergyInput;
  onChange: (_e: EnergyInput) => void; // eslint-disable-line no-unused-vars
}) {
  return (
    <div className="space-y-6">
      <div>
        <Text variant="h3" className="mb-2">
          Home Energy Use
        </Text>
        <Text variant="muted">Average monthly household energy consumption.</Text>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <NumberInput
          id="electricity"
          label="Electricity usage"
          value={energy.electricityKwhPerMonth}
          onChange={(v) => onChange({ ...energy, electricityKwhPerMonth: v })}
          icon={Zap}
          unit="kWh/month"
          max={10000}
        />
        <NumberInput
          id="gas"
          label="Natural gas usage"
          value={energy.gasThermPerMonth}
          onChange={(v) => onChange({ ...energy, gasThermPerMonth: v })}
          icon={Flame}
          unit="therms/month"
          max={1000}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="renewable" className="flex items-center gap-2 text-sm font-medium">
          <Leaf className="h-4 w-4 text-stellar-green" aria-hidden="true" />
          Renewable energy percentage
        </label>
        <div className="flex items-center gap-4">
          <input
            id="renewable"
            type="range"
            min={0}
            max={100}
            step={5}
            value={energy.renewablePercentage}
            onChange={(e) =>
              onChange({ ...energy, renewablePercentage: parseInt(e.target.value, 10) })
            }
            className="flex-1 accent-stellar-green"
            aria-label={`Renewable energy: ${energy.renewablePercentage}%`}
          />
          <Badge variant="success" className="min-w-[3rem] text-center">
            {energy.renewablePercentage}%
          </Badge>
        </div>
      </div>
    </div>
  );
}

function LifestyleStep({
  lifestyle,
  onChange,
}: {
  lifestyle: LifestyleInput;
  onChange: (_l: LifestyleInput) => void; // eslint-disable-line no-unused-vars
}) {
  const dietOptions: { value: DietType; label: string; description: string }[] = [
    { value: 'vegan', label: 'Vegan', description: 'Plant-based diet' },
    { value: 'vegetarian', label: 'Vegetarian', description: 'No meat' },
    { value: 'average', label: 'Average', description: 'Mixed diet' },
    { value: 'heavy-meat', label: 'Heavy Meat', description: 'Meat daily' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Text variant="h3" className="mb-2">
          Lifestyle
        </Text>
        <Text variant="muted">Your diet and consumption habits affect your footprint.</Text>
      </div>

      {/* Diet Selection */}
      <div className="space-y-3">
        <Text className="flex items-center gap-2 text-sm font-medium">
          <Drumstick className="h-4 w-4 text-stellar-blue" aria-hidden="true" />
          Diet type
        </Text>
        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-3"
          role="radiogroup"
          aria-label="Diet type"
        >
          {dietOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={lifestyle.dietType === opt.value}
              onClick={() => onChange({ ...lifestyle, dietType: opt.value })}
              className={`flex flex-col items-center p-4 rounded-xl border-2 transition-all focus:outline-none focus:ring-2 focus:ring-stellar-blue/50 ${
                lifestyle.dietType === opt.value
                  ? 'border-stellar-blue bg-stellar-blue/10'
                  : 'border-border hover:border-stellar-blue/30'
              }`}
            >
              <Text className="font-semibold text-sm">{opt.label}</Text>
              <Text variant="muted" className="text-xs mt-1">
                {opt.description}
              </Text>
            </button>
          ))}
        </div>
      </div>

      {/* Shopping Habits */}
      <div className="space-y-3">
        <label htmlFor="shopping" className="flex items-center gap-2 text-sm font-medium">
          <ShoppingBag className="h-4 w-4 text-stellar-blue" aria-hidden="true" />
          Shopping habits
        </label>
        <Select
          id="shopping"
          variant="primary"
          value={lifestyle.shoppingHabits}
          onChange={(e) =>
            onChange({
              ...lifestyle,
              shoppingHabits: e.target.value as LifestyleInput['shoppingHabits'],
            })
          }
        >
          <option value="minimal">Minimal — Buy only essentials</option>
          <option value="average">Average — Regular shopping</option>
          <option value="frequent">Frequent — Shop often, new items</option>
        </Select>
      </div>
    </div>
  );
}

function ResultsStep({
  travel,
  energy,
  lifestyle,
  onReset,
}: {
  travel: TravelInput;
  energy: EnergyInput;
  lifestyle: LifestyleInput;
  onReset: () => void;
}) {
  const results = useMemo(
    () => calculateImpact(travel, energy, lifestyle),
    [travel, energy, lifestyle]
  );

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams();
    params.set('co2', results.totalEmissions.toString());
    params.set('credits', results.recommendedCredits.toString());
    return `${window.location.origin}/impact-calculator?${params.toString()}`;
  }, [results.totalEmissions, results.recommendedCredits]);

  const handleShare = useCallback(() => {
    if (navigator.share) {
      navigator
        .share({
          title: 'My Carbon Footprint — FarmCredit',
          text: `My annual carbon footprint is ${results.totalEmissions} tonnes CO₂. I need ${results.recommendedCredits} carbon credits to offset it!`,
          url: shareUrl,
        })
        .catch(() => {
          /* user cancelled */
        });
    } else {
      navigator.clipboard.writeText(shareUrl).catch(() => {
        /* clipboard unavailable */
      });
    }
  }, [results.totalEmissions, results.recommendedCredits, shareUrl]);

  const categories = [
    {
      label: 'Travel',
      value: results.travelEmissions,
      color: 'bg-stellar-blue',
      textColor: 'text-stellar-blue',
    },
    {
      label: 'Energy',
      value: results.energyEmissions,
      color: 'bg-stellar-purple',
      textColor: 'text-stellar-purple',
    },
    {
      label: 'Lifestyle',
      value: results.lifestyleEmissions,
      color: 'bg-stellar-green',
      textColor: 'text-stellar-green',
    },
  ];

  return (
    <div className="space-y-8">
      <div className="text-center">
        <Text variant="h2" className="mb-2">
          Your Carbon Footprint
        </Text>
        <Text variant="muted">Annual CO₂ emissions estimate</Text>
      </div>

      {/* Total */}
      <div
        className="text-center p-8 rounded-2xl bg-gradient-to-br from-stellar-blue/10 to-stellar-purple/10 border border-stellar-blue/20"
        role="status"
        aria-live="polite"
      >
        <Text className="text-6xl font-bold text-stellar-blue">{results.totalEmissions}</Text>
        <Text variant="muted" className="text-lg mt-2">
          tonnes CO₂ per year
        </Text>
      </div>

      {/* Breakdown */}
      <div className="space-y-4">
        <Text variant="h4">Breakdown</Text>
        {categories.map((cat) => {
          const pct =
            results.totalEmissions > 0 ? Math.round((cat.value / results.totalEmissions) * 100) : 0;
          return (
            <div key={cat.label} className="space-y-1">
              <div className="flex justify-between text-sm">
                <Text className="font-medium">{cat.label}</Text>
                <Text className={cat.textColor}>
                  {cat.value}t ({pct}%)
                </Text>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full ${cat.color} transition-all duration-500`}
                  style={{ width: `${pct}%` }}
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${cat.label}: ${pct}%`}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Recommendations */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-6 rounded-xl bg-stellar-green/10 border border-stellar-green/30">
          <div className="flex items-center gap-3 mb-2">
            <Trees className="h-6 w-6 text-stellar-green" aria-hidden="true" />
            <Text className="font-semibold text-stellar-green">Trees Needed</Text>
          </div>
          <Text className="text-3xl font-bold text-stellar-green">
            {results.treesEquivalent.toLocaleString()}
          </Text>
          <Text variant="muted" className="text-xs mt-1">
            to absorb your annual emissions
          </Text>
        </div>
        <div className="p-6 rounded-xl bg-stellar-blue/10 border border-stellar-blue/30">
          <div className="flex items-center gap-3 mb-2">
            <BarChart3 className="h-6 w-6 text-stellar-blue" aria-hidden="true" />
            <Text className="font-semibold text-stellar-blue">Credits to Offset</Text>
          </div>
          <Text className="text-3xl font-bold text-stellar-blue">{results.recommendedCredits}</Text>
          <Text variant="muted" className="text-xs mt-1">
            carbon credits recommended
          </Text>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Link href="/credits" className="sm:flex-[2]">
          <Button stellar="primary" size="lg" width="full" aria-label="Offset your carbon now">
            Offset Now
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Button>
        </Link>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="sm:flex-1"
          onClick={handleShare}
          aria-label="Share your carbon footprint results"
        >
          <Share2 className="mr-2 h-4 w-4" aria-hidden="true" />
          Share
        </Button>
      </div>

      <Button
        type="button"
        variant="ghost"
        width="full"
        onClick={onReset}
        aria-label="Recalculate your carbon footprint"
      >
        Recalculate
      </Button>
    </div>
  );
}

export function ImpactCalculator() {
  const [step, setStep] = useState<CalculatorStep>('travel');
  const [travel, setTravel] = useState<TravelInput>({ ...DEFAULT_TRAVEL });
  const [energy, setEnergy] = useState<EnergyInput>({ ...DEFAULT_ENERGY });
  const [lifestyle, setLifestyle] = useState<LifestyleInput>({ ...DEFAULT_LIFESTYLE });

  const handleNext = useCallback(() => {
    const order: CalculatorStep[] = ['travel', 'energy', 'lifestyle', 'results'];
    const idx = order.indexOf(step);
    if (idx < order.length - 1) {
      setStep(order[idx + 1]);
    }
  }, [step]);

  const handleBack = useCallback(() => {
    const order: CalculatorStep[] = ['travel', 'energy', 'lifestyle', 'results'];
    const idx = order.indexOf(step);
    if (idx > 0) {
      setStep(order[idx - 1]);
    }
  }, [step]);

  const handleReset = useCallback(() => {
    setTravel({ ...DEFAULT_TRAVEL });
    setEnergy({ ...DEFAULT_ENERGY });
    setLifestyle({ ...DEFAULT_LIFESTYLE });
    setStep('travel');
  }, []);

  return (
    <div className="w-full max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <Badge variant="accent" className="mb-4">
          Carbon Footprint Calculator
        </Badge>
        <Text variant="h1" className="text-3xl sm:text-4xl font-bold mb-3">
          What&apos;s your impact?
        </Text>
        <Text variant="muted" className="text-base sm:text-lg max-w-lg mx-auto">
          Estimate your annual carbon footprint and discover how many credits you need to go carbon
          neutral.
        </Text>
      </div>

      {/* Step Indicator */}
      <StepIndicator currentStep={step} />

      {/* Step Content */}
      <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-sm">
        {step === 'travel' && <TravelStep travel={travel} onChange={setTravel} />}
        {step === 'energy' && <EnergyStep energy={energy} onChange={setEnergy} />}
        {step === 'lifestyle' && <LifestyleStep lifestyle={lifestyle} onChange={setLifestyle} />}
        {step === 'results' && (
          <ResultsStep
            travel={travel}
            energy={energy}
            lifestyle={lifestyle}
            onReset={handleReset}
          />
        )}

        {/* Navigation (not shown on results step) */}
        {step !== 'results' && (
          <div className="flex gap-3 mt-8 pt-6 border-t border-border">
            {step !== 'travel' && (
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={handleBack}
                aria-label="Go to previous step"
              >
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                Back
              </Button>
            )}
            <Button
              type="button"
              stellar="primary"
              size="lg"
              className="ml-auto"
              onClick={handleNext}
              aria-label={step === 'lifestyle' ? 'See your results' : 'Go to next step'}
            >
              {step === 'lifestyle' ? 'See Results' : 'Next'}
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
