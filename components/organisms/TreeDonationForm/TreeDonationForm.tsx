'use client';

/**
 * TreeDonationForm — Issue #335
 *
 * Self-contained donation form that lets donors:
 *   1. Select a tree count (minimum 2 trees)
 *   2. Choose payment method: Freighter wallet (XLM/USDC) or credit card (Stripe)
 *   3. Submit and see real-time on-page confirmation
 */

import { useState, useCallback, useRef } from 'react';
import { Minus, Plus, Trees, CheckCircle, AlertCircle, Wallet, CreditCard } from 'lucide-react';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { Badge } from '@/components/atoms/Badge';
import { LoadingSpinner } from '@/components/atoms/LoadingSpinner/LoadingSpinner';
import { WalletModal } from '@/components/organisms/WalletModal/WalletModal';
import { useWalletContext } from '@/contexts/WalletContext';
import { processDonationPayment } from '@/lib/stellar/donation';
import { generateIdempotencyKey } from '@/lib/constants/donation';
import { showToast } from '@/lib/toast';
import type { TransactionStatus } from '@/lib/types/payment';

// 1 tree = 1 USDC / $1 — consistent with TREES_PER_DOLLAR in donation constants
const USDC_PER_TREE = 1;
const MINIMUM_TREES = 2;
const QUICK_TREE_COUNTS = [2, 5, 10, 25, 50];

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '');

// ── Confirmation Panel ────────────────────────────────────────────────────────

interface ConfirmationPanelProps {
  treeCount: number;
  totalUsdc: number;
  txId: string;
  paymentMethod: 'stellar' | 'card';
  onDonateAgain: () => void;
}

function ConfirmationPanel({
  treeCount,
  totalUsdc,
  txId,
  paymentMethod,
  onDonateAgain,
}: ConfirmationPanelProps) {
  const explorerUrl =
    paymentMethod === 'stellar' ? `https://stellar.expert/explorer/testnet/tx/${txId}` : null;

  return (
    <div className="flex flex-col items-center text-center space-y-6 py-8">
      <div className="flex items-center justify-center w-20 h-20 rounded-full bg-stellar-green/10">
        <CheckCircle className="w-10 h-10 text-stellar-green" aria-hidden="true" />
      </div>

      <div>
        <Text variant="h2" className="text-2xl font-bold mb-2">
          Thank you for planting {treeCount} tree{treeCount > 1 ? 's' : ''}!
        </Text>
        <Text variant="muted">Your {totalUsdc.toFixed(2)} USDC donation has been received.</Text>
      </div>

      <div className="w-full rounded-xl border border-border bg-muted/20 p-4 space-y-2 text-left">
        <div className="flex justify-between">
          <Text variant="small" className="text-muted-foreground">
            Trees planted
          </Text>
          <Text variant="small" className="font-semibold">
            {treeCount}
          </Text>
        </div>
        <div className="flex justify-between">
          <Text variant="small" className="text-muted-foreground">
            Amount paid
          </Text>
          <Text variant="small" className="font-semibold">
            {totalUsdc.toFixed(2)} USDC
          </Text>
        </div>
        <div className="flex justify-between">
          <Text variant="small" className="text-muted-foreground">
            Transaction ID
          </Text>
          <Text variant="small" className="font-mono text-xs break-all">
            {txId.slice(0, 12)}…
          </Text>
        </div>
      </div>

      {explorerUrl && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-stellar-blue underline underline-offset-2"
        >
          View on Stellar Explorer
        </a>
      )}

      <Button type="button" variant="outline" size="lg" onClick={onDonateAgain} className="w-full">
        Donate Again
      </Button>
    </div>
  );
}

// ── Stripe Inner Form ─────────────────────────────────────────────────────────

interface StripeFormProps {
  onSuccess: (paymentIntentId: string) => void;
  onError: (message: string) => void;
}

function StripeInnerForm({ onSuccess, onError }: StripeFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: 'if_required',
    });

    if (error) {
      onError(error.message ?? 'Payment failed');
    } else if (paymentIntent?.status === 'succeeded') {
      onSuccess(paymentIntent.id);
    }
    setSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      <Button
        type="submit"
        size="lg"
        className="w-full bg-stellar-green hover:bg-stellar-green/90"
        disabled={!stripe || submitting}
      >
        {submitting ? (
          <span className="flex items-center gap-2">
            <LoadingSpinner size="xs" />
            Processing…
          </span>
        ) : (
          <>
            <CreditCard className="mr-2 h-4 w-4" aria-hidden="true" />
            Pay with Card
          </>
        )}
      </Button>
    </form>
  );
}

// ── Main Form ─────────────────────────────────────────────────────────────────

export function TreeDonationForm() {
  const { wallet } = useWalletContext();

  const [treeCount, setTreeCount] = useState(MINIMUM_TREES);
  const [customCount, setCustomCount] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'stellar' | 'card'>('stellar');
  const [stellarStatus, setStellarStatus] = useState<TransactionStatus>('idle');
  const [stellarError, setStellarError] = useState<string | null>(null);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [txId, setTxId] = useState('');
  const [stripeClientSecret, setStripeClientSecret] = useState<string | null>(null);
  const [fetchingIntent, setFetchingIntent] = useState(false);

  const isProcessingRef = useRef(false);

  const resolvedCount = isCustom ? parseInt(customCount, 10) || 0 : treeCount;
  const isValidCount = resolvedCount >= MINIMUM_TREES;
  const totalUsdc = resolvedCount * USDC_PER_TREE;

  const isStellarProcessing = ['preparing', 'signing', 'submitting', 'confirming'].includes(
    stellarStatus
  );

  // ── Tree count helpers ────────────────────────────────────────────────────

  const increment = () => {
    setIsCustom(false);
    setTreeCount((c) => c + 1);
  };

  const decrement = () => {
    setIsCustom(false);
    setTreeCount((c) => Math.max(MINIMUM_TREES, c - 1));
  };

  const selectQuick = (count: number) => {
    setIsCustom(false);
    setCustomCount('');
    setTreeCount(count);
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '');
    setCustomCount(val);
    setIsCustom(true);
  };

  // ── Stripe intent ─────────────────────────────────────────────────────────

  const fetchStripeIntent = useCallback(async () => {
    if (!isValidCount) return;
    setFetchingIntent(true);
    try {
      const res = await fetch('/api/stripe/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: totalUsdc,
          isMonthly: false,
          idempotencyKey: generateIdempotencyKey(),
        }),
      });
      if (!res.ok) throw new Error('Failed to create payment intent');
      const { clientSecret } = (await res.json()) as { clientSecret: string };
      setStripeClientSecret(clientSecret);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Card setup failed';
      showToast(msg, 'error');
    } finally {
      setFetchingIntent(false);
    }
  }, [isValidCount, totalUsdc]);

  const handleMethodChange = (method: 'stellar' | 'card') => {
    setPaymentMethod(method);
    setStellarError(null);
    setStellarStatus('idle');
    if (method === 'card' && !stripeClientSecret) {
      void fetchStripeIntent();
    }
  };

  // ── Stellar payment ───────────────────────────────────────────────────────

  const handleStellarPay = useCallback(async () => {
    if (isProcessingRef.current || !wallet || !isValidCount) return;
    isProcessingRef.current = true;
    setStellarError(null);

    try {
      const result = await processDonationPayment(
        totalUsdc,
        wallet,
        generateIdempotencyKey(),
        (status) => setStellarStatus(status)
      );
      setTxId(result.transactionHash);
      setConfirmed(true);
      showToast('Donation successful!', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Payment failed';
      setStellarError(msg);
      setStellarStatus('error');
      showToast(msg, 'error');
    } finally {
      isProcessingRef.current = false;
    }
  }, [wallet, totalUsdc, isValidCount]);

  // ── Stripe callbacks ──────────────────────────────────────────────────────

  const handleStripeSuccess = (paymentIntentId: string) => {
    setTxId(paymentIntentId);
    setConfirmed(true);
    showToast('Donation successful!', 'success');
  };

  const handleStripeError = (message: string) => {
    showToast(message, 'error');
  };

  const handleDonateAgain = () => {
    setConfirmed(false);
    setTxId('');
    setTreeCount(MINIMUM_TREES);
    setIsCustom(false);
    setCustomCount('');
    setStellarStatus('idle');
    setStellarError(null);
    setStripeClientSecret(null);
    setPaymentMethod('stellar');
  };

  // ── Render: confirmation ──────────────────────────────────────────────────

  if (confirmed) {
    return (
      <ConfirmationPanel
        treeCount={resolvedCount}
        totalUsdc={totalUsdc}
        txId={txId}
        paymentMethod={paymentMethod}
        onDonateAgain={handleDonateAgain}
      />
    );
  }

  const usdcBalance = wallet ? parseFloat(wallet.balance.usdc) : 0;
  const xlmBalance = wallet ? parseFloat(wallet.balance.xlm) : 0;
  const hasSufficientStellar = wallet ? usdcBalance >= totalUsdc || xlmBalance >= totalUsdc : false;

  // ── Render: form ──────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* ── Step 1: Tree count ─────────────────────────────────────────────── */}
      <section aria-labelledby="tree-count-heading">
        <Text id="tree-count-heading" variant="h2" className="text-xl font-bold mb-4">
          How many trees?
        </Text>

        {/* Quick-select chips */}
        <div className="flex flex-wrap gap-3 mb-4">
          {QUICK_TREE_COUNTS.map((count) => (
            <button
              key={count}
              type="button"
              onClick={() => selectQuick(count)}
              aria-pressed={!isCustom && treeCount === count}
              className={`px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
                !isCustom && treeCount === count
                  ? 'border-stellar-green bg-stellar-green text-white'
                  : 'border-border bg-background hover:border-stellar-green'
              }`}
            >
              {count} {count === 1 ? 'tree' : 'trees'}
            </button>
          ))}
        </div>

        {/* Stepper + custom input */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={decrement}
            disabled={resolvedCount <= MINIMUM_TREES}
            aria-label="Decrease tree count"
            className="flex items-center justify-center w-10 h-10 rounded-full border border-border bg-background disabled:opacity-40 hover:bg-muted transition-colors"
          >
            <Minus className="w-4 h-4" />
          </button>

          <div className="flex-1 relative">
            <input
              type="text"
              inputMode="numeric"
              value={isCustom ? customCount : resolvedCount.toString()}
              onChange={handleCustomChange}
              aria-label="Tree count"
              className="w-full text-center text-3xl font-bold border-b-2 border-stellar-green bg-transparent focus:outline-none py-1"
            />
            <Text variant="small" className="text-center text-muted-foreground mt-1">
              trees (min. {MINIMUM_TREES})
            </Text>
          </div>

          <button
            type="button"
            onClick={increment}
            aria-label="Increase tree count"
            className="flex items-center justify-center w-10 h-10 rounded-full border border-border bg-background hover:bg-muted transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {isCustom && !isValidCount && customCount !== '' && (
          <Text variant="small" className="text-destructive mt-2" role="alert">
            Minimum {MINIMUM_TREES} trees required.
          </Text>
        )}
      </section>

      {/* ── Cost summary ───────────────────────────────────────────────────── */}
      {isValidCount && (
        <div
          className="rounded-xl border border-stellar-green/30 bg-stellar-green/5 p-4 flex items-center gap-4"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-stellar-green">
            <Trees className="w-6 h-6 text-white" aria-hidden="true" />
          </div>
          <div className="flex-1">
            <Text className="font-bold text-stellar-green text-2xl">
              {resolvedCount} tree{resolvedCount !== 1 ? 's' : ''}
            </Text>
            <Text variant="small" className="text-muted-foreground">
              Each tree absorbs ~22 kg CO₂/year
            </Text>
          </div>
          <div className="text-right">
            <Text className="font-bold text-xl">{totalUsdc.toFixed(2)} USDC</Text>
            <Badge variant="outline" className="text-xs">
              ≈ ${totalUsdc.toFixed(2)} USD
            </Badge>
          </div>
        </div>
      )}

      {/* ── Step 2: Payment method ─────────────────────────────────────────── */}
      <section aria-labelledby="payment-method-heading">
        <Text id="payment-method-heading" variant="h2" className="text-xl font-bold mb-4">
          Payment method
        </Text>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <button
            type="button"
            onClick={() => handleMethodChange('stellar')}
            aria-pressed={paymentMethod === 'stellar'}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors ${
              paymentMethod === 'stellar'
                ? 'border-stellar-blue bg-stellar-blue/5'
                : 'border-border hover:border-stellar-blue/50'
            }`}
          >
            <Wallet
              className={`w-6 h-6 ${paymentMethod === 'stellar' ? 'text-stellar-blue' : 'text-muted-foreground'}`}
              aria-hidden="true"
            />
            <Text
              variant="small"
              className={`font-semibold ${paymentMethod === 'stellar' ? 'text-stellar-blue' : ''}`}
            >
              Freighter Wallet
            </Text>
            <Text variant="small" className="text-muted-foreground text-xs text-center">
              XLM / USDC
            </Text>
          </button>

          <button
            type="button"
            onClick={() => handleMethodChange('card')}
            aria-pressed={paymentMethod === 'card'}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors ${
              paymentMethod === 'card'
                ? 'border-stellar-blue bg-stellar-blue/5'
                : 'border-border hover:border-stellar-blue/50'
            }`}
          >
            <CreditCard
              className={`w-6 h-6 ${paymentMethod === 'card' ? 'text-stellar-blue' : 'text-muted-foreground'}`}
              aria-hidden="true"
            />
            <Text
              variant="small"
              className={`font-semibold ${paymentMethod === 'card' ? 'text-stellar-blue' : ''}`}
            >
              Credit Card
            </Text>
            <Text variant="small" className="text-muted-foreground text-xs text-center">
              Visa / Mastercard
            </Text>
          </button>
        </div>

        {/* ── Stellar payment panel ─────────────────────────────────────────── */}
        {paymentMethod === 'stellar' && (
          <div className="space-y-4">
            {!wallet ? (
              <div className="rounded-xl border border-border bg-muted/20 p-6 text-center space-y-4">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-stellar-blue/10">
                  <Wallet className="h-7 w-7 text-stellar-blue" aria-hidden="true" />
                </div>
                <div>
                  <Text variant="body" className="font-semibold">
                    Connect your Freighter wallet
                  </Text>
                  <Text variant="muted" className="mt-1">
                    Pay with USDC or XLM on the Stellar network
                  </Text>
                </div>
                <Button
                  type="button"
                  size="lg"
                  stellar="primary"
                  width="full"
                  onClick={() => setWalletModalOpen(true)}
                  aria-label="Connect Freighter wallet"
                >
                  <Wallet className="mr-2 h-4 w-4" aria-hidden="true" />
                  Connect Wallet
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Connected wallet info */}
                <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-stellar-green" aria-hidden="true" />
                      <Text variant="small" className="font-medium">
                        Wallet Connected
                      </Text>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {wallet.network}
                    </Badge>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="font-mono text-muted-foreground text-xs">
                      {wallet.publicKey.slice(0, 8)}…{wallet.publicKey.slice(-6)}
                    </span>
                    <span className="font-medium">
                      {usdcBalance.toFixed(2)} USDC · {xlmBalance.toFixed(2)} XLM
                    </span>
                  </div>
                </div>

                {/* Insufficient balance warning */}
                {isValidCount && !hasSufficientStellar && (
                  <div
                    className="flex items-start gap-3 rounded-lg bg-yellow-500/10 p-4"
                    role="alert"
                    aria-live="polite"
                  >
                    <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-600" />
                    <Text variant="small" className="text-yellow-700">
                      Insufficient balance. You need {totalUsdc.toFixed(2)} USDC but have{' '}
                      {usdcBalance.toFixed(2)} USDC / {xlmBalance.toFixed(2)} XLM.
                    </Text>
                  </div>
                )}

                {/* Processing status */}
                {isStellarProcessing && (
                  <div className="flex items-center gap-3 rounded-lg bg-stellar-blue/10 p-4">
                    <LoadingSpinner size="sm" />
                    <Text variant="body" className="text-stellar-blue font-medium">
                      {stellarStatus === 'preparing' && 'Building transaction…'}
                      {stellarStatus === 'signing' && 'Awaiting wallet signature…'}
                      {stellarStatus === 'submitting' && 'Submitting to network…'}
                      {stellarStatus === 'confirming' && 'Confirming transaction…'}
                    </Text>
                  </div>
                )}

                {/* Error */}
                {stellarError && (
                  <div
                    className="flex items-start gap-3 rounded-lg bg-destructive/10 p-4"
                    role="alert"
                  >
                    <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
                    <div className="flex-1">
                      <Text variant="small" className="font-medium text-destructive">
                        Payment failed
                      </Text>
                      <Text variant="small" className="text-destructive/80">
                        {stellarError}
                      </Text>
                    </div>
                  </div>
                )}

                <Button
                  type="button"
                  size="lg"
                  stellar="primary"
                  width="full"
                  onClick={handleStellarPay}
                  disabled={!isValidCount || isStellarProcessing || !hasSufficientStellar}
                  aria-label={`Donate ${totalUsdc.toFixed(2)} USDC via Stellar`}
                >
                  {isStellarProcessing ? (
                    <span className="flex items-center gap-2">
                      <LoadingSpinner size="xs" />
                      Processing…
                    </span>
                  ) : (
                    <>
                      <Wallet className="mr-2 h-4 w-4" aria-hidden="true" />
                      Donate {totalUsdc.toFixed(2)} USDC
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── Stripe / card payment panel ───────────────────────────────────── */}
        {paymentMethod === 'card' && (
          <div>
            {fetchingIntent && (
              <div className="flex items-center justify-center py-8">
                <LoadingSpinner size="md" />
              </div>
            )}

            {!fetchingIntent && stripeClientSecret && (
              <Elements
                stripe={stripePromise}
                options={{ clientSecret: stripeClientSecret, appearance: { theme: 'stripe' } }}
              >
                <StripeInnerForm onSuccess={handleStripeSuccess} onError={handleStripeError} />
              </Elements>
            )}

            {!fetchingIntent && !stripeClientSecret && isValidCount && (
              <Button
                type="button"
                size="lg"
                className="w-full bg-stellar-green hover:bg-stellar-green/90"
                onClick={() => void fetchStripeIntent()}
              >
                <CreditCard className="mr-2 h-4 w-4" aria-hidden="true" />
                Set up card payment
              </Button>
            )}
          </div>
        )}
      </section>

      <WalletModal
        isOpen={walletModalOpen}
        onOpenChange={setWalletModalOpen}
        onSuccess={() => setWalletModalOpen(false)}
      />
    </div>
  );
}
