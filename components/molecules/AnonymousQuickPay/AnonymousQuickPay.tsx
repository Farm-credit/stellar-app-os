'use client';

import { useCallback, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle, CreditCard, Info, MapPin, TreeDeciduous } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { Badge } from '@/components/atoms/Badge';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner/LoadingSpinner';
import { StripePaymentForm } from '@/components/molecules/StripePaymentForm/StripePaymentForm';
import { formatCurrency, formatNumber, MINIMUM_DONATION, CO2_PER_DOLLAR } from '@/lib/constants/donation';

const SPECIES_OPTIONS = [
  { value: 'moringa', label: 'Moringa' },
  { value: 'neem', label: 'Neem' },
  { value: 'mangrove', label: 'Mangrove' },
  { value: 'acacia', label: 'Acacia' },
];

const REGION_OPTIONS = [
  { value: 'northern-nigeria', label: 'Northern Nigeria' },
  { value: 'coastal-kenya', label: 'Coastal Kenya' },
  { value: 'amazon-basin', label: 'Amazon Basin' },
  { value: 'east-africa', label: 'East Africa' },
];

const QUICK_AMOUNTS = [5, 10, 25, 50];

export function AnonymousQuickPay() {
  const [amount, setAmount] = useState('10');
  const [species, setSpecies] = useState(SPECIES_OPTIONS[0].value);
  const [region, setRegion] = useState(REGION_OPTIONS[0].value);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [transactionId, setTransactionId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const amountValue = useMemo(() => parseFloat(amount) || 0, [amount]);
  const isValidAmount = amountValue >= MINIMUM_DONATION;
  const treeEstimate = Math.max(0, amountValue);
  const impactKg = useMemo(() => amountValue * CO2_PER_DOLLAR, [amountValue]);
  const speciesLabel = SPECIES_OPTIONS.find((item) => item.value === species)?.label ?? 'Selected species';
  const regionLabel = REGION_OPTIONS.find((item) => item.value === region)?.label ?? 'Selected region';

  const handleAmountChange = useCallback((value: string) => {
    const sanitized = value.replace(/[^0-9.]/g, '');
    setAmount(sanitized);
    setShowPaymentForm(false);
    setError(null);
  }, []);

  const handleQuickAmount = useCallback((value: number) => {
    setAmount(value.toString());
    setShowPaymentForm(false);
    setError(null);
  }, []);

  const handleStartPayment = useCallback(() => {
    if (!isValidAmount) {
      setError(`Minimum donation is ${formatCurrency(MINIMUM_DONATION)}.`);
      return;
    }

    setError(null);
    setShowPaymentForm(true);
  }, [isValidAmount]);

  const handleSuccess = useCallback((paymentIntentId: string) => {
    setConfirmed(true);
    setTransactionId(paymentIntentId);
    setShowPaymentForm(false);
    setIsProcessing(false);
  }, []);

  const handleProcessing = useCallback(() => {
    setIsProcessing(true);
    setError(null);
  }, []);

  const handleStripeError = useCallback((message: string) => {
    setError(message);
    setIsProcessing(false);
  }, []);

  const handleReset = useCallback(() => {
    setAmount('10');
    setSpecies(SPECIES_OPTIONS[0].value);
    setRegion(REGION_OPTIONS[0].value);
    setShowPaymentForm(false);
    setConfirmed(false);
    setTransactionId('');
    setError(null);
  }, []);

  if (confirmed) {
    return (
      <div className="rounded-3xl border border-stellar-green/20 bg-stellar-green/5 p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-stellar-green p-3 text-white">
            <CheckCircle className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <Text className="text-lg font-semibold">Quick pay completed</Text>
            <Text variant="muted" className="text-sm">
              Your anonymous donation was submitted successfully.
            </Text>
          </div>
        </div>

        <div className="grid gap-3 rounded-2xl border border-stellar-green/30 bg-white p-4 text-sm">
          <div className="flex justify-between gap-4">
            <Text variant="small" className="text-muted-foreground">
              Amount
            </Text>
            <Text className="font-semibold">{formatCurrency(amountValue)}</Text>
          </div>
          <div className="flex justify-between gap-4">
            <Text variant="small" className="text-muted-foreground">
              Species
            </Text>
            <Text className="font-semibold">{speciesLabel}</Text>
          </div>
          <div className="flex justify-between gap-4">
            <Text variant="small" className="text-muted-foreground">
              Region
            </Text>
            <Text className="font-semibold">{regionLabel}</Text>
          </div>
          <div className="flex justify-between gap-4">
            <Text variant="small" className="text-muted-foreground">
              Transaction ID
            </Text>
            <Text className="font-mono text-xs break-all">{transactionId}</Text>
          </div>
        </div>

        <Button onClick={handleReset} size="lg" width="full">
          Make another anonymous donation
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-border bg-card p-6 space-y-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Text className="text-xl font-semibold">Anonymous quick pay</Text>
          <Text variant="muted" className="text-sm">
            No account required. Select a species, choose a region, enter an amount, and pay securely by card.
          </Text>
        </div>
        <Badge variant="outline" className="text-xs uppercase tracking-[0.16em]">
          No login
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm">
          <div className="flex items-center gap-2 font-medium text-gray-900">
            <TreeDeciduous className="h-4 w-4 text-stellar-green" aria-hidden="true" />
            Species
          </div>
          <Select
            value={species}
            onChange={(event) => {
              setSpecies(event.target.value);
              setShowPaymentForm(false);
              setError(null);
            }}
            variant="default"
            selectSize="lg"
          >
            {SPECIES_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>

        <label className="space-y-2 text-sm">
          <div className="flex items-center gap-2 font-medium text-gray-900">
            <MapPin className="h-4 w-4 text-stellar-blue" aria-hidden="true" />
            Region
          </div>
          <Select
            value={region}
            onChange={(event) => {
              setRegion(event.target.value);
              setShowPaymentForm(false);
              setError(null);
            }}
            variant="default"
            selectSize="lg"
          >
            {REGION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="anonymous-quick-pay-amount" className="text-sm font-medium text-gray-900">
            Amount (USDC)
          </label>
          <Text variant="small" className="text-muted-foreground">
            Minimum {formatCurrency(MINIMUM_DONATION)}
          </Text>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Input
            id="anonymous-quick-pay-amount"
            type="text"
            value={amount}
            onChange={(event) => handleAmountChange(event.target.value)}
            placeholder="10"
            inputSize="lg"
            aria-describedby="anonymous-quick-pay-hint"
          />
          <Button
            type="button"
            variant="outline"
            size="lg"
            width="full"
            onClick={handleStartPayment}
            disabled={!isValidAmount || isProcessing}
          >
            <CreditCard className="mr-2 h-4 w-4" aria-hidden="true" />
            Pay {isValidAmount ? formatCurrency(amountValue) : 'now'}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_AMOUNTS.map((quick) => (
            <Button
              key={quick}
              type="button"
              variant={quick === amountValue ? 'outline' : 'ghost'}
              size="sm"
              className="rounded-full px-3"
              onClick={() => handleQuickAmount(quick)}
            >
              {formatCurrency(quick)}
            </Button>
          ))}
        </div>
        <Text id="anonymous-quick-pay-hint" variant="muted" className="text-sm">
          The amount is processed as USDC and converted into an estimated environmental impact before payment.
        </Text>
      </div>

      <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <Text className="font-semibold">Estimated impact</Text>
          <Badge variant="outline" className="text-xs">
            {speciesLabel} · {regionLabel}
          </Badge>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <Text variant="small" className="text-muted-foreground">
              CO₂ offset
            </Text>
            <Text className="mt-1 text-lg font-semibold">
              {formatNumber(impactKg)} kg
            </Text>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <Text variant="small" className="text-muted-foreground">
              Equivalent trees
            </Text>
            <Text className="mt-1 text-lg font-semibold">{formatNumber(treeEstimate)}</Text>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {showPaymentForm ? (
        <div className="rounded-3xl border border-stellar-blue/20 bg-white p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-2xl bg-stellar-blue/10 p-2 text-stellar-blue">
              <Info className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <Text className="font-semibold">Secure checkout</Text>
              <Text variant="small" className="text-muted-foreground">
                Enter your card details to complete the quick anonymous donation.
              </Text>
            </div>
          </div>
          <StripePaymentForm
            key={`${amount}-${species}-${region}-${idempotencyKey}`}
            amount={amountValue}
            isMonthly={false}
            donorEmail=""
            donorName="Anonymous quick pay"
            idempotencyKey={idempotencyKey}
            onProcessing={handleProcessing}
            onSuccess={handleSuccess}
            onError={handleStripeError}
            disabled={isProcessing}
          />
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
            Enter an amount and click <strong>Pay now</strong> to open the secure checkout.
          </div>
        </div>
      )}
    </div>
  );
}
