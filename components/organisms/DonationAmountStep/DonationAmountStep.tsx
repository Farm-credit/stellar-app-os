'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { Input } from '@/components/atoms/Input';
import { Badge } from '@/components/atoms/Badge';
import { ProgressStepper } from '@/components/molecules/ProgressStepper/ProgressStepper';
import { useDonationContext } from '@/contexts/DonationContext';
import { Trees, Mountain, Leaf, Sprout, Minus, Wind, UserRound, EyeOff } from 'lucide-react';
import {
  MINIMUM_DONATION,
  TREES_PER_DOLLAR,
  HECTARES_PER_DOLLAR,
  CO2_PER_DOLLAR,
  REPLANTING_BUFFER_PERCENT,
  calculateDonationAllocation,
  formatCurrency,
  formatNumber,
} from '@/lib/constants/donation';
import { MAX_BATCH_TREES } from '@/lib/stellar/transaction';
import { IMPACT_DATA } from '@/lib/api/impactData';
import type { RegionAllocation } from '@/lib/types/donor';
import { TREE_SPECIES } from '@/lib/constants/species';

const DonationRegionMap = dynamic(
  () => import('@/components/organisms/DonationRegionMap').then((module) => module.DonationRegionMap),
  { ssr: false }
);

const QUICK_AMOUNTS = [10, 25, 50, 100];

export function DonationAmountStep() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    setAmount: persistAmount,
    setTreeCount: persistTreeCount,
    setIsMonthly: persistIsMonthly,
    setRegionAllocations,
    setSpecies,
    setRegion,
    setDonorInfo,
    state,
  } = useDonationContext();

  // Initialize from URL params if available
  const [selectedAmount, setSelectedAmount] = useState<number | null>(() => {
    const urlAmount = searchParams.get('amount');
    if (urlAmount) {
      const parsed = parseFloat(urlAmount);
      if (!isNaN(parsed) && QUICK_AMOUNTS.includes(parsed)) {
        return parsed;
      }
    }
    return 25; // Default to most popular
  });

  const [customAmount, setCustomAmount] = useState<string>(() => {
    const urlAmount = searchParams.get('amount');
    if (urlAmount) {
      const parsed = parseFloat(urlAmount);
      if (!isNaN(parsed) && !QUICK_AMOUNTS.includes(parsed)) {
        return urlAmount;
      }
    }
    return '';
  });

  const [isCustom, setIsCustom] = useState<boolean>(() => {
    const urlAmount = searchParams.get('amount');
    if (urlAmount) {
      const parsed = parseFloat(urlAmount);
      return !isNaN(parsed) && !QUICK_AMOUNTS.includes(parsed);
    }
    return false;
  });

  const [isMonthly, setIsMonthly] = useState<boolean>(() => {
    return searchParams.get('monthly') === 'true';
  });

  const [treeCount, setTreeCount] = useState<number>(1);
  const [selectedSpeciesSlug, setSelectedSpeciesSlug] = useState(state.speciesSlug);
  const [selectedRegionId, setSelectedRegionId] = useState(state.regionId || IMPACT_DATA.regions[0].id);
  const [donationMode, setDonationMode] = useState<'tracked' | 'anonymous'>(
    state.donorInfo.anonymous ? 'anonymous' : 'tracked'
  );

  // Initialize region allocations with default (first region gets all trees)
  const [regionAllocations, setLocalRegionAllocations] = useState<RegionAllocation[]>(() => {
    if (state.regionAllocations.length > 0) return state.regionAllocations;
    const firstRegion = IMPACT_DATA.regions[0];
    return [{ regionId: firstRegion.id, treeCount: 1 }];
  });

  const currentAmount = isCustom ? parseFloat(customAmount) || 0 : selectedAmount || 0;
  const isValidAmount = currentAmount >= MINIMUM_DONATION;
  const selectedSpecies = TREE_SPECIES.find((species) => species.slug === selectedSpeciesSlug) ?? TREE_SPECIES[0];
  const selectedRegion = IMPACT_DATA.regions.find((region) => region.id === selectedRegionId) ?? IMPACT_DATA.regions[0];

  // Handle extremely large amounts (cap display at reasonable values)
  const safeAmount = Math.min(currentAmount, 1000000);
  const totalAmount = safeAmount * treeCount;

  const allocation = calculateDonationAllocation(safeAmount);

  // Calculate total allocated trees
  const totalAllocatedTrees = useMemo(() => {
    return regionAllocations.reduce((sum, alloc) => sum + alloc.treeCount, 0);
  }, [regionAllocations]);

  useEffect(() => {
    if (regionAllocations.length === 1 && regionAllocations[0].regionId === selectedRegionId) {
      setLocalRegionAllocations([{ regionId: selectedRegionId, treeCount }]);
    }
  }, [selectedRegionId, treeCount]);

  // Helper to update region tree counts
  const updateRegionAllocation = (regionId: string, newTreeCount: number) => {
    setLocalRegionAllocations((prev) => {
      const updated = prev.map((alloc) => {
        if (alloc.regionId === regionId) {
          return { ...alloc, treeCount: newTreeCount };
        }
        return alloc;
      });
      return updated;
    });
  };

  // Helper to add a region
  const addRegion = (regionId: string) => {
    setLocalRegionAllocations((prev) => {
      if (prev.some((alloc) => alloc.regionId === regionId)) return prev;
      return [...prev, { regionId, treeCount: 0 }];
    });
  };

  // Helper to remove a region
  const removeRegion = (regionId: string) => {
    setLocalRegionAllocations((prev) => prev.filter((alloc) => alloc.regionId !== regionId));
  };

  const impact = {
    trees: Math.round(totalAmount * TREES_PER_DOLLAR),
    hectares: (totalAmount * HECTARES_PER_DOLLAR).toFixed(2),
    co2: (totalAmount * CO2_PER_DOLLAR).toFixed(1),
  };

  const handleQuickSelect = (amount: number) => {
    setSelectedAmount(amount);
    setIsCustom(false);
    setCustomAmount('');
  };

  const handleCustomClick = () => {
    setIsCustom(true);
    setSelectedAmount(null);
  };

  const handleCustomAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow only numbers and one decimal point
    const value = e.target.value.replace(/[^0-9.]/g, '');
    // Prevent multiple decimal points
    const parts = value.split('.');
    if (parts.length > 2) return;
    // Limit to 2 decimal places
    if (parts[1] && parts[1].length > 2) return;

    setCustomAmount(value);
  };

  const handleContinue = () => {
    if (isValidAmount && totalAllocatedTrees === treeCount) {
      persistAmount(currentAmount);
      persistTreeCount(treeCount);
      persistIsMonthly(isMonthly);
      setSpecies(selectedSpecies.slug);
      setRegion(selectedRegion.id);
      setRegionAllocations(regionAllocations);
      setDonorInfo({ anonymous: donationMode === 'anonymous', privacyAccepted: donationMode === 'anonymous' });
      router.push(donationMode === 'anonymous' ? '/donate/payment' : '/donate/info');
    }
  };

  const steps = [
    { id: 'amount', label: 'AMOUNT', path: '/donate', status: 'current' as const },
    { id: 'info', label: 'YOUR INFO', path: '/donate/info', status: 'upcoming' as const },
    { id: 'payment', label: 'PAYMENT', path: '/donate/payment', status: 'upcoming' as const },
    { id: 'success', label: 'SUCCESS', path: '/donate/confirmation', status: 'upcoming' as const },
  ];

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8">
      {/* Progress Stepper */}
      <div className="mb-12">
        <ProgressStepper steps={steps} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column - Amount Selection */}
        <div className="space-y-8">
          <div>
            <Text variant="h1" className="mb-4 text-3xl font-bold sm:text-4xl">
              Choose your impact.
            </Text>
            <Text variant="muted" className="text-lg">
              100% of your gift goes directly to planting local saplings and restoring ecosystems.
              Every dollar brings us closer to a greener planet.
            </Text>
          </div>

          {/* Species selection */}
          <section className="space-y-4" aria-labelledby="species-heading">
            <div>
              <Text variant="h2" as="h2" id="species-heading" className="text-xl font-bold">
                Choose a species
              </Text>
              <Text variant="muted" className="text-sm">
                Your selection sets the estimated annual CO2 impact.
              </Text>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {TREE_SPECIES.slice(0, 6).map((species) => {
                const selected = species.slug === selectedSpecies.slug;
                return (
                  <button
                    key={species.slug}
                    type="button"
                    onClick={() => setSelectedSpeciesSlug(species.slug)}
                    aria-pressed={selected}
                    className={`rounded-xl border p-3 text-left transition ${selected ? 'border-stellar-green bg-stellar-green/10 ring-2 ring-stellar-green/20' : 'border-gray-200 bg-white hover:border-stellar-green/50'}`}
                  >
                    <span className="block font-semibold text-gray-900">{species.name}</span>
                    <span className="mt-1 block text-xs text-gray-500">{species.maturityYears} year maturity</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-4 rounded-xl border border-stellar-green/30 bg-stellar-green/10 p-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-stellar-green text-white">
                <Wind className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <Text className="font-semibold">{selectedSpecies.name} CO2 estimate</Text>
                <Text variant="muted" className="text-sm">
                  About {selectedSpecies.co2KgPerYear} kg CO2 per tree per year at maturity
                </Text>
              </div>
            </div>
          </section>

          {/* Region map */}
          <section className="space-y-4" aria-labelledby="region-heading">
            <div>
              <Text variant="h2" as="h2" id="region-heading" className="text-xl font-bold">
                Pick a planting region
              </Text>
              <Text variant="muted" className="text-sm">
                Select a marker to direct your trees to a local planting team.
              </Text>
            </div>
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <DonationRegionMap
                regions={IMPACT_DATA.regions}
                selectedRegionId={selectedRegion.id}
                onSelect={(regionId) => {
                  setSelectedRegionId(regionId);
                  setLocalRegionAllocations([{ regionId, treeCount }]);
                }}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3 text-sm">
              <span className="font-medium text-gray-900">Selected region</span>
              <span className="text-stellar-blue">{selectedRegion.name}</span>
            </div>
          </section>

          {/* Visibility choice */}
          <fieldset className="space-y-3">
            <legend className="font-semibold text-gray-900">How should this gift appear?</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                ['tracked', 'Tracked impact', 'Receive updates and follow your trees.', UserRound],
                ['anonymous', 'Anonymous gift', 'Donate without a public donor profile.', EyeOff],
              ] as const).map(([mode, label, description, Icon]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setDonationMode(mode)}
                  aria-pressed={donationMode === mode}
                  className={`flex items-start gap-3 rounded-xl border p-4 text-left ${donationMode === mode ? 'border-stellar-blue bg-stellar-blue/10 ring-2 ring-stellar-blue/20' : 'border-gray-200 hover:border-stellar-blue/50'}`}
                >
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-stellar-blue" aria-hidden />
                  <span><span className="block font-medium">{label}</span><span className="mt-1 block text-xs text-muted-foreground">{description}</span></span>
                </button>
              ))}
            </div>
          </fieldset>

          {/* Quick Select Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            {QUICK_AMOUNTS.map((amount) => (
              <Button
                key={amount}
                onClick={() => handleQuickSelect(amount)}
                variant={selectedAmount === amount && !isCustom ? 'default' : 'outline'}
                size="lg"
                className={`relative p-6 h-auto ${
                  selectedAmount === amount && !isCustom
                    ? 'border-stellar-blue bg-stellar-blue/10 text-stellar-blue hover:bg-stellar-blue/20'
                    : ''
                }`}
                aria-pressed={selectedAmount === amount && !isCustom}
                aria-label={`Select ${formatCurrency(amount)} donation`}
              >
                {amount === 25 && (
                  <Badge
                    variant="default"
                    className="absolute -top-3 left-1/2 -translate-x-1/2 bg-stellar-blue text-white text-xs"
                  >
                    MOST POPULAR
                  </Badge>
                )}
                <Text className="text-2xl font-bold">{formatCurrency(amount)}</Text>
              </Button>
            ))}

            {/* Custom Button */}
            <Button
              onClick={handleCustomClick}
              variant={isCustom ? 'default' : 'outline'}
              size="lg"
              className={`relative p-6 h-auto ${
                isCustom
                  ? 'border-stellar-blue bg-stellar-blue/10 text-stellar-blue hover:bg-stellar-blue/20'
                  : ''
              }`}
              aria-pressed={isCustom}
              aria-label="Enter custom donation amount"
            >
              <Text className="text-2xl font-bold">Custom</Text>
            </Button>
          </div>

          {/* Custom Amount Input - Only show when Custom is selected */}
          {isCustom && (
            <div className="space-y-4">
              <Text className="font-medium text-gray-700">Enter your custom amount</Text>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg">
                  $
                </span>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={customAmount}
                  onChange={handleCustomAmountChange}
                  className="pl-8 text-lg h-14"
                  aria-label="Custom donation amount in dollars"
                  aria-describedby={
                    customAmount && parseFloat(customAmount) < MINIMUM_DONATION
                      ? 'amount-error'
                      : undefined
                  }
                  aria-invalid={customAmount ? parseFloat(customAmount) < MINIMUM_DONATION : false}
                  autoFocus
                />
              </div>
              {customAmount && parseFloat(customAmount) < MINIMUM_DONATION && (
                <Text
                  id="amount-error"
                  variant="muted"
                  className="text-sm text-red-500"
                  role="alert"
                >
                  Minimum donation is {formatCurrency(MINIMUM_DONATION)}
                </Text>
              )}
            </div>
          )}

          {/* Monthly Gift Toggle */}
          <div className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 bg-white">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-stellar-green/10">
              <Leaf className="w-5 h-5 text-stellar-green" />
            </div>
            <div className="flex-1">
              <Text className="font-medium">Make this a monthly gift</Text>
              <Text variant="muted" className="text-sm">
                Subsidize your environmental footprint every month.
              </Text>
            </div>
            <button
              onClick={() => setIsMonthly(!isMonthly)}
              role="switch"
              aria-checked={isMonthly}
              aria-label="Make this a monthly recurring donation"
              className={`relative w-12 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-stellar-green focus:ring-offset-2 ${
                isMonthly ? 'bg-stellar-green' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  isMonthly ? 'translate-x-6' : ''
                }`}
              />
            </button>
          </div>

          {/* Tree Quantity Selector */}
          <div className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 bg-white">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-stellar-green/10">
              <Trees className="w-5 h-5 text-stellar-green" />
            </div>
            <div className="flex-1">
              <Text className="font-medium">Number of trees</Text>
              <Text variant="muted" className="text-sm">
                Fund up to {MAX_BATCH_TREES} trees in one transaction
              </Text>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTreeCount((n) => Math.max(1, n - 1))}
                disabled={treeCount <= 1}
                aria-label="Decrease tree count"
                className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-lg font-bold disabled:opacity-40 hover:bg-gray-100 transition-colors"
              >
                −
              </button>
              <Text className="w-8 text-center font-semibold tabular-nums">{treeCount}</Text>
              <button
                type="button"
                onClick={() => setTreeCount((n) => Math.min(MAX_BATCH_TREES, n + 1))}
                disabled={treeCount >= MAX_BATCH_TREES}
                aria-label="Increase tree count"
                className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-lg font-bold disabled:opacity-40 hover:bg-gray-100 transition-colors"
              >
                +
              </button>
            </div>
          </div>

          {/* Region Allocation Selector */}
          <div className="p-4 rounded-lg border border-gray-200 bg-white space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-stellar-blue/10">
                  <Mountain className="w-5 h-5 text-stellar-blue" />
                </div>
                <Text className="font-medium">Distribute trees across regions</Text>
              </div>
              <Text variant="muted" className="text-sm">
                {totalAllocatedTrees}/{treeCount} allocated
              </Text>
            </div>

            {/* Selected Regions */}
            <div className="space-y-3">
              {regionAllocations.map((alloc) => {
                const region = IMPACT_DATA.regions.find((r) => r.id === alloc.regionId);
                if (!region) return null;
                return (
                  <div
                    key={alloc.regionId}
                    className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50"
                  >
                    <div className="flex-1">
                      <Text className="font-medium">{region.name}</Text>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          updateRegionAllocation(alloc.regionId, Math.max(0, alloc.treeCount - 1))
                        }
                        disabled={alloc.treeCount <= 0}
                        aria-label={`Decrease trees in ${region.name}`}
                        className="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center text-sm font-bold disabled:opacity-40 hover:bg-white transition-colors"
                      >
                        −
                      </button>
                      <Text className="w-7 text-center font-semibold tabular-nums text-sm">
                        {alloc.treeCount}
                      </Text>
                      <button
                        type="button"
                        onClick={() =>
                          updateRegionAllocation(
                            alloc.regionId,
                            Math.min(MAX_BATCH_TREES, alloc.treeCount + 1)
                          )
                        }
                        disabled={totalAllocatedTrees >= treeCount}
                        aria-label={`Increase trees in ${region.name}`}
                        className="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center text-sm font-bold disabled:opacity-40 hover:bg-white transition-colors"
                      >
                        +
                      </button>
                    </div>
                    {regionAllocations.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRegion(alloc.regionId)}
                        aria-label={`Remove ${region.name}`}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add More Regions */}
            <div className="space-y-2">
              <Text variant="muted" className="text-sm">
                Add more regions:
              </Text>
              <div className="flex flex-wrap gap-2">
                {IMPACT_DATA.regions
                  .filter(
                    (region) => !regionAllocations.some((alloc) => alloc.regionId === region.id)
                  )
                  .map((region) => (
                    <Button
                      key={region.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addRegion(region.id)}
                      className="text-xs"
                    >
                      + {region.name}
                    </Button>
                  ))}
              </div>
            </div>
          </div>

          {/* Continue Button */}
          <div className="space-y-3">
            <Button
              onClick={handleContinue}
              disabled={!isValidAmount || totalAllocatedTrees !== treeCount}
              size="lg"
              className="w-full h-14 text-lg bg-stellar-green hover:bg-stellar-green/90 disabled:bg-gray-300 disabled:cursor-not-allowed"
              aria-label={`Continue with ${formatCurrency(currentAmount)} donation`}
            >
              {totalAllocatedTrees !== treeCount
                ? `Allocate ${treeCount - totalAllocatedTrees} more trees to continue`
                : 'Continue →'}
            </Button>
          </div>
        </div>

        {/* Right Column - Impact Calculator */}
        <div className="lg:sticky lg:top-8 h-fit">
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-200 space-y-6">
            <div>
              <Text variant="h2" className="text-2xl font-bold mb-2">
                Your Impact
              </Text>
              <Text variant="muted">Real-time projection of your gift</Text>
            </div>

            {/* Trees */}
            <div
              className="p-6 rounded-xl bg-stellar-green/10 border border-stellar-green/30"
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center gap-4">
                <div
                  className="flex items-center justify-center w-12 h-12 rounded-lg bg-stellar-green"
                  aria-hidden="true"
                >
                  <Trees className="w-6 h-6 text-white" />
                </div>
                <div>
                  <Text className="text-4xl font-bold text-stellar-green">
                    {formatNumber(impact.trees)}
                  </Text>
                  <Text className="text-sm font-medium text-stellar-green">TREES PLANTED</Text>
                </div>
              </div>
            </div>

            {/* Hectares */}
            <div
              className="p-6 rounded-xl bg-stellar-blue/10 border border-stellar-blue/30"
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center gap-4">
                <div
                  className="flex items-center justify-center w-12 h-12 rounded-lg bg-stellar-blue"
                  aria-hidden="true"
                >
                  <Mountain className="w-6 h-6 text-white" />
                </div>
                <div>
                  <Text className="text-4xl font-bold text-stellar-blue">{impact.hectares}</Text>
                  <Text className="text-sm font-medium text-stellar-blue">HECTARES RESTORED</Text>
                </div>
              </div>
            </div>

            {/* CO2 Offset */}
            <div
              className="p-6 rounded-xl bg-gray-50 border border-gray-200"
              role="status"
              aria-live="polite"
            >
              <div className="flex items-center gap-4">
                <div
                  className="flex items-center justify-center w-12 h-12 rounded-lg bg-gray-800"
                  aria-hidden="true"
                >
                  <Text className="text-white font-bold text-sm">CO₂</Text>
                </div>
                <div>
                  <Text className="text-4xl font-bold text-gray-800">{impact.co2}t</Text>
                  <Text className="text-sm font-medium text-gray-600">CO2 OFFSET / YEAR</Text>
                </div>
              </div>
            </div>

            {/* Replanting Buffer Fund Breakdown */}
            {safeAmount > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Sprout className="w-4 h-4 text-amber-600" aria-hidden="true" />
                  <Text className="text-sm font-semibold text-amber-800">
                    Donation Allocation{treeCount > 1 ? ` (${treeCount} trees)` : ''}
                  </Text>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Text className="text-sm text-amber-700">Tree planting (70%)</Text>
                    <Text className="text-sm font-semibold text-amber-900">
                      {formatCurrency(allocation.planting * treeCount)}
                    </Text>
                  </div>
                  <div className="flex justify-between items-center">
                    <Text className="text-sm text-amber-700">
                      Replanting buffer ({Math.round(REPLANTING_BUFFER_PERCENT * 100)}%)
                    </Text>
                    <Text className="text-sm font-semibold text-amber-900">
                      {formatCurrency(allocation.buffer * treeCount)}
                    </Text>
                  </div>
                  <div className="border-t border-amber-200 pt-2 flex justify-between items-center">
                    <Text className="text-sm font-semibold text-amber-800">Total</Text>
                    <Text className="text-sm font-bold text-amber-900">
                      {formatCurrency(allocation.total * treeCount)}
                    </Text>
                  </div>
                </div>
                <Text className="text-xs text-amber-600">
                  The buffer fund covers tree failures and ensures survival rate targets are met.
                </Text>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
