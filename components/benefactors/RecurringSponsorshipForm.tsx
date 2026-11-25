'use client';

import { useState, type FormEvent } from 'react';
import { CalendarDays, ExternalLink, Loader2, WalletCards } from 'lucide-react';
import { useWalletContext } from '@/contexts/WalletContext';
import {
  buildSubscriptionSetupXdr,
  createSep7PoolPaymentUri,
} from '@/lib/stellar/subscription-sponsorship';

interface RecurringSponsorshipFormProps {
  stewardAddress: string;
  poolAddress: string;
  tokenAddress: string;
}

export function RecurringSponsorshipForm({
  stewardAddress,
  poolAddress,
  tokenAddress,
}: RecurringSponsorshipFormProps) {
  const { wallet, signTransaction } = useWalletContext();
  const [amount, setAmount] = useState('25');
  const [trees, setTrees] = useState('1');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paymentUri, setPaymentUri] = useState<string | null>(null);

  async function createSubscription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    setPaymentUri(null);
    const amountNumber = Number(amount);
    const treesNumber = Number(trees);
    if (!wallet?.publicKey) {
      setStatus('Connect a Stellar wallet before starting a sponsorship.');
      return;
    }
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      setStatus('Enter a positive monthly amount.');
      return;
    }
    if (!Number.isInteger(treesNumber) || treesNumber < 1 || treesNumber > 50) {
      setStatus('Choose between 1 and 50 trees per month.');
      return;
    }
    setBusy(true);
    try {
      const xdr = await buildSubscriptionSetupXdr({
        sponsor: wallet.publicKey,
        steward: stewardAddress,
        token: tokenAddress,
        amountPerCycle: BigInt(Math.round(amountNumber * 10_000_000)),
        treesPerCycle: treesNumber,
        network: wallet.network === 'mainnet' ? 'mainnet' : 'testnet',
      });
      const signed = await signTransaction(
        xdr,
        wallet.network === 'mainnet'
          ? 'Public Global Stellar Network ; September 2015'
          : 'Test SDF Network ; September 2015'
      );
      setStatus(
        `Subscription transaction signed (${signed.slice(0, 12)}…). Submit it from your wallet to activate the monthly pool contribution.`
      );
    } catch (error) {
      console.warn('[RecurringSponsorshipForm] Subscription setup failed:', error);
      setStatus(error instanceof Error ? error.message : 'Unable to create the subscription.');
    } finally {
      setBusy(false);
    }
  }

  function showFundingLink() {
    setPaymentUri(
      createSep7PoolPaymentUri({
        destination: poolAddress,
        amount,
        assetCode: 'USDC',
        memo: 'Farm Credit monthly pool',
      })
    );
  }

  return (
    <section className="rounded-2xl border border-sky-200 bg-sky-50/70 p-6 dark:border-sky-900 dark:bg-sky-950/30">
      <div className="flex items-start gap-3">
        <CalendarDays className="mt-1 h-5 w-5 text-sky-700" aria-hidden="true" />
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Sponsor every month</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Set up an automatic Soroban contribution to a designated community agroforestry pool.
          </p>
        </div>
      </div>
      <form onSubmit={createSubscription} className="mt-5 grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="monthly-amount" className="block text-sm font-medium">
            Monthly amount (USDC)
          </label>
          <input
            id="monthly-amount"
            type="number"
            min="1"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className="mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm dark:bg-slate-950"
          />
        </div>
        <div>
          <label htmlFor="monthly-trees" className="block text-sm font-medium">
            Trees per month
          </label>
          <input
            id="monthly-trees"
            type="number"
            min="1"
            max="50"
            step="1"
            value={trees}
            onChange={(event) => setTrees(event.target.value)}
            className="mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm dark:bg-slate-950"
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex w-full items-center justify-center rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {busy ? (
              'Preparing…'
            ) : (
              <>
                <WalletCards className="mr-2 h-4 w-4" aria-hidden="true" /> Set up on Stellar
              </>
            )}
          </button>
        </div>
      </form>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={showFundingLink}
          className="text-sm font-semibold text-sky-700 hover:underline dark:text-sky-300"
        >
          Create SEP-0007 pool funding link
        </button>
        {paymentUri && (
          <a
            href={paymentUri}
            className="inline-flex items-center gap-1 text-sm text-slate-600 hover:underline dark:text-slate-300"
          >
            Open payment link <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        )}
      </div>
      <p
        role="status"
        aria-live="polite"
        className={
          status
            ? 'mt-4 rounded-lg border border-sky-200 bg-white/70 p-3 text-sm text-sky-900 dark:border-sky-800 dark:bg-slate-950/50 dark:text-sky-200'
            : 'sr-only'
        }
      >
        {status ?? ''}
      </p>
    </section>
  );
}
