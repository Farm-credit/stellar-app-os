'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWalletContext } from '@/contexts/WalletContext';
import {
  buyVerifiedFieldCreditPortion,
  listVerifiedFieldCredit,
} from '@/lib/stellar/field-carbon-marketplace';
import type { NetworkType } from '@/lib/types/wallet';

interface FieldRetailLot {
  id: number;
  projectId: string;
  seller: string;
  totalGrams: number;
  remainingGrams: number;
  pricePerTon: string;
  active: boolean;
  openedAt: number;
  evidenceDigest: string;
}

interface IssuanceDetails {
  sponsor: string;
  projectId: string;
  issuedGrams: number;
  availableGrams: number;
  evidenceDigest: string;
}

const GRAMS_PER_TON = 1_000_000n;

function shortAddress(value: string): string {
  return `${value.slice(0, 6)}…${value.slice(-6)}`;
}

function tonnes(grams: number): string {
  return (grams / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 3 });
}

export function VerifiedFieldMarketplace() {
  const { wallet, connect, signTransaction } = useWalletContext();
  const network: NetworkType =
    wallet?.network ??
    (process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet');
  const [lots, setLots] = useState<FieldRetailLot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyLotId, setBusyLotId] = useState<number | null>(null);
  const [digestInput, setDigestInput] = useState('');
  const [credit, setCredit] = useState<IssuanceDetails | null>(null);
  const [gramsToList, setGramsToList] = useState('1000000');
  const [pricePerTon, setPricePerTon] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isListing, setIsListing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refreshLots = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/field-credits/marketplace?network=${network}`, {
        cache: 'no-store',
      });
      const body = (await response.json()) as { lots?: FieldRetailLot[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Could not load verified field-credit lots.');
      setLots(body.lots ?? []);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not load verified field-credit lots.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [network]);

  useEffect(() => {
    void refreshLots();
  }, [refreshLots]);

  const formattedListingCost = useMemo(() => {
    if (!credit || !/^\d+$/.test(gramsToList) || !/^\d+$/.test(pricePerTon)) return null;
    const grams = BigInt(gramsToList);
    const price = BigInt(pricePerTon);
    if (grams <= 0n || price <= 0n) return null;
    return ((grams * price) / GRAMS_PER_TON).toString();
  }, [credit, gramsToList, pricePerTon]);

  const handleLookup = async () => {
    setCredit(null);
    setMessage(null);
    const digest = digestInput.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(digest)) {
      setError(
        'Enter the 64-character SHA-256 evidence digest from the field-credit issuance receipt.'
      );
      return;
    }
    setIsLookingUp(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/field-credits/issuance?digest=${digest}&network=${network}`,
        { cache: 'no-store' }
      );
      const body = (await response.json()) as { credit?: IssuanceDetails; error?: string };
      if (!response.ok || !body.credit)
        throw new Error(body.error ?? 'Field-credit evidence was not found.');
      setCredit(body.credit);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Field-credit evidence was not found.');
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleList = async () => {
    if (!wallet?.isConnected || !wallet.publicKey || !credit) {
      setError('Connect the sponsor wallet for this issuance before listing it.');
      return;
    }
    if (wallet.publicKey !== credit.sponsor) {
      setError(
        'The connected wallet does not match the sponsor recorded for this evidence digest.'
      );
      return;
    }
    try {
      const grams = BigInt(gramsToList);
      const price = BigInt(pricePerTon);
      if (grams <= 0n || grams % GRAMS_PER_TON !== 0n || grams > BigInt(credit.availableGrams)) {
        throw new Error('Enter a whole-ton amount no greater than the unlisted verified balance.');
      }
      setIsListing(true);
      setError(null);
      setMessage(null);
      const hash = await listVerifiedFieldCredit(
        wallet.publicKey,
        credit.evidenceDigest,
        grams,
        price,
        network,
        signTransaction
      );
      setMessage(`Verified field credits listed. Transaction: ${hash}`);
      setCredit({ ...credit, availableGrams: credit.availableGrams - Number(grams) });
      await refreshLots();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Listing failed. Check the transaction before retrying.'
      );
    } finally {
      setIsListing(false);
    }
  };

  const handleBuy = async (lot: FieldRetailLot) => {
    if (!wallet?.isConnected || !wallet.publicKey) {
      try {
        await connect('freighter', network);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Connect a Stellar wallet to purchase.');
      }
      return;
    }
    try {
      setBusyLotId(lot.id);
      setError(null);
      setMessage(null);
      const hash = await buyVerifiedFieldCreditPortion(
        wallet.publicKey,
        lot.id,
        GRAMS_PER_TON,
        network,
        signTransaction
      );
      setMessage(`Purchase confirmed. Transaction: ${hash}`);
      await refreshLots();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Purchase failed. Check the transaction before retrying.'
      );
    } finally {
      setBusyLotId(null);
    }
  };

  return (
    <section
      id="verified-field-credits"
      className="space-y-8 rounded-3xl border border-stellar-green/30 bg-background p-6 md:p-8"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stellar-green">
            Evidence-backed marketplace
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-foreground">Verified field credits</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Only lots linked on-chain to a reviewed field-measurement digest appear here. Modeled
            legacy credits are not marked or shown as field-verified.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
            {network}
          </span>
          <button
            type="button"
            onClick={() => void refreshLots()}
            className="rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
            disabled={isLoading}
          >
            {isLoading ? 'Refreshing…' : 'Refresh lots'}
          </button>
        </div>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="break-all rounded-xl border border-stellar-green/30 bg-stellar-green/5 px-4 py-3 text-sm text-foreground"
        >
          {message}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)]">
        <div className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">Open verified lots</h3>
              <p className="text-xs text-muted-foreground">
                Purchases are whole-ton portions paid to the seller in the configured retail token.
              </p>
            </div>
            <span className="text-xs text-muted-foreground">On-chain · latest 25 lots</span>
          </div>
          {isLoading ? (
            <p className="rounded-2xl border border-border p-5 text-sm text-muted-foreground">
              Loading contract listings…
            </p>
          ) : lots.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground">
              No active field-evidence-backed lots are listed on this network yet.
            </p>
          ) : (
            <div className="space-y-3">
              {lots.map((lot) => (
                <article key={lot.id} className="rounded-2xl border border-border p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Lot #{lot.id} · Project {lot.projectId}
                      </p>
                      <p className="mt-1 text-lg font-semibold">
                        {tonnes(lot.remainingGrams)} t available
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {lot.pricePerTon} payment-token base units per ton · seller{' '}
                        {shortAddress(lot.seller)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleBuy(lot)}
                      disabled={busyLotId !== null}
                      className="rounded-xl bg-stellar-green px-4 py-2 text-sm font-semibold text-stellar-navy hover:opacity-90 disabled:opacity-50"
                    >
                      {busyLotId === lot.id
                        ? 'Confirming…'
                        : wallet?.isConnected
                          ? 'Buy 1 ton'
                          : 'Connect & buy 1 ton'}
                    </button>
                  </div>
                  <details className="mt-4 text-xs text-muted-foreground">
                    <summary className="cursor-pointer">View evidence reference</summary>
                    <p className="mt-2 break-all font-mono">SHA-256: {lot.evidenceDigest}</p>
                  </details>
                </article>
              ))}
            </div>
          )}
        </div>

        <aside className="h-fit rounded-2xl border border-border bg-muted/30 p-5">
          <h3 className="text-lg font-semibold">List verified field credits</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Look up the digest supplied with the field-credit issuance receipt. The contract
            verifies the issuer record and sponsor when you sign.
          </p>
          <label className="mt-4 block text-sm font-medium" htmlFor="field-evidence-digest">
            Evidence digest
          </label>
          <input
            id="field-evidence-digest"
            value={digestInput}
            onChange={(event) => setDigestInput(event.target.value)}
            placeholder="64-character SHA-256 hex"
            className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-xs"
          />
          <button
            type="button"
            onClick={() => void handleLookup()}
            disabled={isLookingUp}
            className="mt-3 w-full rounded-xl border border-stellar-green px-4 py-2 text-sm font-semibold text-foreground hover:bg-stellar-green/10 disabled:opacity-50"
          >
            {isLookingUp ? 'Checking contract…' : 'Verify issuance digest'}
          </button>
          {credit && (
            <div className="mt-4 space-y-3 rounded-xl border border-border bg-background p-4 text-sm">
              <p>
                <span className="text-muted-foreground">Project:</span> {credit.projectId}
              </p>
              <p>
                <span className="text-muted-foreground">On-chain issuance:</span>{' '}
                {tonnes(credit.issuedGrams)} t
              </p>
              <p>
                <span className="text-muted-foreground">Unlisted balance:</span>{' '}
                {tonnes(credit.availableGrams)} t
              </p>
              <p className="break-all">
                <span className="text-muted-foreground">Sponsor:</span> {credit.sponsor}
              </p>
              <label className="block text-xs font-medium" htmlFor="field-listing-grams">
                Amount to list (grams; whole tons)
              </label>
              <input
                id="field-listing-grams"
                type="number"
                min="1000000"
                step="1000000"
                max={credit.availableGrams}
                value={gramsToList}
                onChange={(event) => setGramsToList(event.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2"
              />
              <label className="block text-xs font-medium" htmlFor="field-listing-price">
                Price per ton (payment-token base units)
              </label>
              <input
                id="field-listing-price"
                type="number"
                min="1"
                step="1"
                value={pricePerTon}
                onChange={(event) => setPricePerTon(event.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2"
              />
              <p className="text-xs text-muted-foreground">
                Estimated total: {formattedListingCost ?? '—'} base units. Token decimals follow the
                configured retail token.
              </p>
              {!wallet?.isConnected && (
                <button
                  type="button"
                  onClick={() => void connect('freighter', network)}
                  className="w-full rounded-xl border border-border px-4 py-2 text-sm hover:bg-muted"
                >
                  Connect sponsor wallet
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleList()}
                disabled={
                  isListing ||
                  isLookingUp ||
                  !wallet?.isConnected ||
                  wallet.publicKey !== credit.sponsor
                }
                className="w-full rounded-xl bg-stellar-green px-4 py-2 text-sm font-semibold text-stellar-navy disabled:opacity-50"
              >
                {isListing ? 'Confirm in wallet…' : 'Sign and list on Stellar'}
              </button>
              {wallet?.isConnected && wallet.publicKey !== credit.sponsor && (
                <p className="text-xs text-destructive">
                  Connect the sponsor address above to list this issuance.
                </p>
              )}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
