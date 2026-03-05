'use client';

import { useState, useEffect, useCallback } from 'react';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner/LoadingSpinner';
import { getStripe } from '@/lib/stripe';
import { formatCurrency } from '@/lib/constants/donation';
import type { StripePaymentIntentResponse } from '@/lib/types/donation-payment';
import { AlertCircle } from 'lucide-react';

interface StripePaymentFormProps {
  amount: number;
  isMonthly: boolean;
  donorEmail: string;
  donorName: string;
  idempotencyKey: string;
  onProcessing: () => void;
  onSuccess: (_paymentIntentId: string) => void; // eslint-disable-line no-unused-vars
  onError: (_message: string) => void; // eslint-disable-line no-unused-vars
  disabled?: boolean;
}

export function StripePaymentForm({
  amount,
  isMonthly,
  donorEmail,
  donorName,
  idempotencyKey,
  onProcessing,
  onSuccess,
  onError,
  disabled,
}: StripePaymentFormProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function createIntent() {
      setLoading(true);
      setInitError(null);

      try {
        const res = await fetch('/api/stripe/create-payment-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount: Math.round(amount * 100), // convert to cents
            currency: 'usd',
            donorEmail,
            donorName,
            isMonthly,
            idempotencyKey,
          }),
        });

        if (!res.ok) {
          const err = (await res.json()) as { error: string };
          throw new Error(err.error || 'Failed to initialize payment');
        }

        const data = (await res.json()) as StripePaymentIntentResponse;
        if (!cancelled) {
          setClientSecret(data.clientSecret);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to initialize payment';
          setInitError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    createIntent();
    return () => {
      cancelled = true;
    };
  }, [amount, isMonthly, donorEmail, donorName, idempotencyKey]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <LoadingSpinner size="md" />
        <Text variant="muted">Initializing payment...</Text>
      </div>
    );
  }

  if (initError) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg bg-destructive/10 p-4" role="alert">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
          <div className="flex-1">
            <Text variant="body" className="font-medium text-destructive">
              Payment initialization failed
            </Text>
            <Text variant="small" className="text-destructive/80">
              {initError}
            </Text>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="lg"
          width="full"
          onClick={() => {
            setLoading(true);
            setInitError(null);
            setClientSecret(null);
          }}
        >
          Try Again
        </Button>
      </div>
    );
  }

  if (!clientSecret) {
    return null;
  }

  const stripePromise = getStripe();

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#14b6e7',
            borderRadius: '8px',
          },
        },
      }}
    >
      <StripeCheckoutForm
        amount={amount}
        onProcessing={onProcessing}
        onSuccess={onSuccess}
        onError={onError}
        disabled={disabled}
      />
    </Elements>
  );
}

interface StripeCheckoutFormProps {
  amount: number;
  onProcessing: () => void;
  onSuccess: (_paymentIntentId: string) => void; // eslint-disable-line no-unused-vars
  onError: (_message: string) => void; // eslint-disable-line no-unused-vars
  disabled?: boolean;
}

function StripeCheckoutForm({
  amount,
  onProcessing,
  onSuccess,
  onError,
  disabled,
}: StripeCheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!stripe || !elements || submitting) return;

      setSubmitting(true);
      setError(null);
      onProcessing();

      try {
        const { error: submitError, paymentIntent } = await stripe.confirmPayment({
          elements,
          confirmParams: {
            return_url: `${window.location.origin}/donate/success?method=card`,
          },
          redirect: 'if_required',
        });

        if (submitError) {
          const message = submitError.message || 'Payment failed. Please try again.';
          setError(message);
          onError(message);
        } else if (paymentIntent && paymentIntent.status === 'succeeded') {
          onSuccess(paymentIntent.id);
        } else {
          const message = 'Payment was not completed. Please try again.';
          setError(message);
          onError(message);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An unexpected error occurred';
        setError(message);
        onError(message);
      } finally {
        setSubmitting(false);
      }
    },
    [stripe, elements, submitting, onProcessing, onSuccess, onError]
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement
        options={{
          layout: 'tabs',
        }}
      />

      {error && (
        <div className="flex items-start gap-3 rounded-lg bg-destructive/10 p-4" role="alert">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
          <Text variant="small" className="flex-1 text-destructive">
            {error}
          </Text>
        </div>
      )}

      <Button
        type="submit"
        size="lg"
        stellar="primary"
        width="full"
        disabled={!stripe || !elements || submitting || disabled}
        aria-label={`Pay ${formatCurrency(amount)}`}
      >
        {submitting ? (
          <span className="flex items-center gap-2">
            <LoadingSpinner size="xs" />
            Processing...
          </span>
        ) : (
          `Pay ${formatCurrency(amount)}`
        )}
      </Button>
    </form>
  );
}
