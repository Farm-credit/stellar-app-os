'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { ProgressStepper } from '@/components/molecules/ProgressStepper/ProgressStepper';
import { PaymentMethodToggle } from '@/components/molecules/PaymentMethodToggle/PaymentMethodToggle';
import { OrderSummary } from '@/components/molecules/OrderSummary/OrderSummary';
import { StripePaymentForm } from '@/components/molecules/StripePaymentForm/StripePaymentForm';
import { StellarPaymentSection } from '@/components/molecules/StellarPaymentSection/StellarPaymentSection';
import { useDonationPayment } from '@/hooks/useDonationPayment';

const steps = [
  { id: 'amount', label: 'AMOUNT', path: '/donate', status: 'completed' as const },
  { id: 'info', label: 'YOUR INFO', path: '/donate/info', status: 'completed' as const },
  { id: 'payment', label: 'PAYMENT', path: '/donate/payment', status: 'current' as const },
  { id: 'success', label: 'SUCCESS', path: '/donate/confirmation', status: 'upcoming' as const },
];

export function PaymentStep() {
  const router = useRouter();
  const {
    paymentState,
    setMethod,
    resetError,
    processStellarPayment,
    onStripeProcessing,
    onStripeSuccess,
    onStripeError,
    isProcessing,
    donationState,
    wallet,
  } = useDonationPayment();

  // Guard: redirect if Step 2 was not completed
  useEffect(() => {
    if (!donationState.donorInfo.privacyAccepted) {
      router.replace('/donate/info');
    }
  }, [donationState.donorInfo.privacyAccepted, router]);

  // Don't render if guard will redirect
  if (!donationState.donorInfo.privacyAccepted) {
    return null;
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-4 py-8">
      {/* Progress Stepper */}
      <div className="mb-12">
        <ProgressStepper steps={steps} />
      </div>

      {/* Header */}
      <div className="text-center mb-8">
        <Text variant="h1" className="text-3xl sm:text-4xl font-bold mb-3">
          Complete your donation
        </Text>
        <Text variant="muted" className="text-base sm:text-lg max-w-md mx-auto">
          Choose your preferred payment method to finalize your gift.
        </Text>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8">
        {/* Left Column — Payment Form */}
        <div className="space-y-6">
          {/* Payment Method Toggle */}
          <PaymentMethodToggle
            selected={paymentState.method}
            onChange={setMethod}
            disabled={isProcessing}
          />

          {/* Payment Form Area */}
          <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-sm">
            {paymentState.method === 'card' ? (
              <StripePaymentForm
                amount={donationState.amount}
                isMonthly={donationState.isMonthly}
                donorEmail={donationState.donorInfo.email}
                donorName={donationState.donorInfo.name}
                idempotencyKey={paymentState.idempotencyKey}
                onProcessing={onStripeProcessing}
                onSuccess={onStripeSuccess}
                onError={onStripeError}
                disabled={isProcessing}
              />
            ) : (
              <StellarPaymentSection
                amount={donationState.amount}
                wallet={wallet}
                status={paymentState.status}
                error={paymentState.error}
                onPay={processStellarPayment}
                onResetError={resetError}
                disabled={isProcessing}
              />
            )}
          </div>

          {/* Back Button */}
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => router.push('/donate/info')}
            disabled={isProcessing}
            aria-label="Go back to donor information"
          >
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            Back
          </Button>
        </div>

        {/* Right Column — Order Summary */}
        <div className="lg:sticky lg:top-8 h-fit">
          <OrderSummary
            amount={donationState.amount}
            isMonthly={donationState.isMonthly}
            paymentMethod={paymentState.method}
          />
        </div>
      </div>
    </div>
  );
}
