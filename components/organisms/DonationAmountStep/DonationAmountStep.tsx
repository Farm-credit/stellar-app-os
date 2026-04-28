'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { Input } from '@/components/atoms/Input';
import { Badge } from '@/components/atoms/Badge';
import { ProgressStepper } from '@/components/molecules/ProgressStepper/ProgressStepper';
import { useDonationContext } from '@/contexts/DonationContext';
import { Trees, Mountain, Leaf, Sprout } from 'lucide-react';
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

const QUICK_AMOUNTS = [10, 25, 50, 100];

export function DonationAmountStep() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    setAmount: persistAmount,
    setTreeCount: persistTreeCount,
    setIsMonthly: persistIsMonthly,
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

  const currentAmount = isCustom ? parseFloat(customAmount) || 0 : selectedAmount || 0;
  const isValidAmount = currentAmount >= MINIMUM_DONATION;

  // Handle extremely large amounts (cap display at reasonable values)
  const safeAmount = Math.min(currentAmount, 1000000);
  const totalAmount = safeAmount * treeCount;

  const allocation = calculateDonationAllocation(safeAmount);

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
    if (isValidAmount) {
      persistAmount(currentAmount);
      persistTreeCount(treeCount);
      persistIsMonthly(isMonthly);
      router.push('/donate/info');
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
            <Text variant="h1" className="text-4xl font-bold mb-4">
              Choose your impact.
            </Text>
            <Text variant="muted" className="text-lg">
              100% of your gift goes directly to planting local saplings and restoring ecosystems.
              Every dollar brings us closer to a greener planet.
            </Text>
          </div>

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

          {/* Continue Button */}
          <div className="space-y-3">
            <Button
              onClick={handleContinue}
              disabled={!isValidAmount}
              size="lg"
              className="w-full h-14 text-lg bg-stellar-green hover:bg-stellar-green/90 disabled:bg-gray-300 disabled:cursor-not-allowed"
              aria-label={`Continue with ${formatCurrency(currentAmount)} donation`}
            >
              Continue →
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
