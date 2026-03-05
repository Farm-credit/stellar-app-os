'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useDonationContext } from '@/contexts/DonationContext';
import { useWalletContext } from '@/contexts/WalletContext';
import { showToast } from '@/lib/toast';
import { generateIdempotencyKey } from '@/lib/constants/donation';
import { processDonationPayment } from '@/lib/stellar/donation';
import type { TransactionStatus } from '@/lib/types/payment';
import type { DonationPaymentMethod, DonationPaymentState } from '@/lib/types/donation-payment';

export function useDonationPayment() {
  const router = useRouter();
  const { state: donationState } = useDonationContext();
  const { wallet } = useWalletContext();

  const [paymentState, setPaymentState] = useState<DonationPaymentState>({
    method: 'card',
    status: 'idle',
    error: null,
    transactionId: null,
    idempotencyKey: generateIdempotencyKey(),
  });

  const isProcessingRef = useRef(false);

  // Prevent accidental page close during processing
  useEffect(() => {
    const activeStatuses: TransactionStatus[] = [
      'preparing',
      'signing',
      'submitting',
      'confirming',
    ];

    if (activeStatuses.includes(paymentState.status)) {
      const handler = (e: BeforeUnloadEvent) => {
        e.preventDefault();
      };
      window.addEventListener('beforeunload', handler);
      return () => window.removeEventListener('beforeunload', handler);
    }
  }, [paymentState.status]);

  const setMethod = useCallback((method: DonationPaymentMethod) => {
    setPaymentState((prev) => ({
      ...prev,
      method,
      error: null,
      status: 'idle',
    }));
  }, []);

  const resetError = useCallback(() => {
    setPaymentState((prev) => ({
      ...prev,
      error: null,
      status: 'idle',
      idempotencyKey: generateIdempotencyKey(),
    }));
  }, []);

  // Stellar payment flow — delegates to service
  const processStellarPayment = useCallback(async () => {
    if (isProcessingRef.current || !wallet) return;
    isProcessingRef.current = true;

    try {
      const result = await processDonationPayment(
        donationState.amount,
        wallet,
        paymentState.idempotencyKey,
        (status) => {
          setPaymentState((prev) => ({ ...prev, status, error: null }));
        }
      );

      setPaymentState((prev) => ({
        ...prev,
        status: 'success',
        transactionId: result.transactionHash,
      }));
      showToast('Payment successful!', 'success');
      router.push(`/donate/confirmation?txHash=${result.transactionHash}&method=stellar&amount=${donationState.amount}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Payment failed';
      setPaymentState((prev) => ({
        ...prev,
        status: 'error',
        error: message,
      }));
      showToast(message, 'error');
    } finally {
      isProcessingRef.current = false;
    }
  }, [wallet, donationState.amount, paymentState.idempotencyKey, router]);

  // Stripe callbacks — coordinated with StripePaymentForm
  const onStripeProcessing = useCallback(() => {
    setPaymentState((prev) => ({ ...prev, status: 'submitting', error: null }));
  }, []);

  const onStripeSuccess = useCallback(
    (paymentIntentId: string) => {
      setPaymentState((prev) => ({
        ...prev,
        status: 'success',
        transactionId: paymentIntentId,
      }));
      showToast('Payment successful!', 'success');
      router.push(`/donate/confirmation?txId=${paymentIntentId}&method=card&amount=${donationState.amount}`);
    },
    [router]
  );

  const onStripeError = useCallback((message: string) => {
    setPaymentState((prev) => ({
      ...prev,
      status: 'error',
      error: message,
      idempotencyKey: generateIdempotencyKey(),
    }));
    showToast(message, 'error');
  }, []);

  const isProcessing = ['preparing', 'signing', 'submitting', 'confirming'].includes(
    paymentState.status
  );

  return {
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
  };
}
