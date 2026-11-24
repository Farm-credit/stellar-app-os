'use client';

import { Suspense, useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Gift, Loader2, Search, Sprout, TreePine } from 'lucide-react';
import {
  GIFT_CARD_REGIONS,
  GIFT_CARD_SPECIES,
  type GiftCard,
} from '@/lib/gift-cards/giftCard';

interface RedemptionFormState {
  redeemedByName: string;
  redeemedByEmail: string;
  species: string;
  region: string;
  treeName: string;
}

function RedeemGiftCardContent() {
  const searchParams = useSearchParams();
  const initialCode = searchParams.get('code') ?? '';

  const [codeInput, setCodeInput] = useState(initialCode);
  const [loadingCard, setLoadingCard] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [giftCard, setGiftCard] = useState<GiftCard | null>(null);

  const [form, setForm] = useState<RedemptionFormState>({
    redeemedByName: '',
    redeemedByEmail: '',
    species: GIFT_CARD_SPECIES[0],
    region: GIFT_CARD_REGIONS[0],
    treeName: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);

  const lookupGiftCard = useCallback(async (codeToLookup: string) => {
    const trimmed = codeToLookup.trim();
    if (!trimmed) {
      setLookupError('Please enter your gift card redemption code.');
      return;
    }

    setLoadingCard(true);
    setLookupError(null);
    setRedeemError(null);

    try {
      const response = await fetch(`/api/gift-cards/${encodeURIComponent(trimmed)}`);
      const body = await response.json();

      if (!response.ok) {
        setGiftCard(null);
        setLookupError(body.error ?? 'Gift card not found.');
        return;
      }

      const loaded = body.giftCard as GiftCard;
      setGiftCard(loaded);
      setForm((prev) => ({
        ...prev,
        redeemedByName: prev.redeemedByName || loaded.recipientName,
        redeemedByEmail: prev.redeemedByEmail || loaded.recipientEmail,
      }));
    } catch {
      setLookupError('Network error while looking up gift card.');
    } finally {
      setLoadingCard(false);
    }
  }, []);

  useEffect(() => {
    if (initialCode) {
      void lookupGiftCard(initialCode);
    }
  }, [initialCode, lookupGiftCard]);

  async function handleLookupSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await lookupGiftCard(codeInput);
  }

  async function handleRedeemSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!giftCard) return;

    setRedeeming(true);
    setRedeemError(null);
    setFormErrors({});

    try {
      const response = await fetch(
        `/api/gift-cards/${encodeURIComponent(giftCard.code)}/redeem`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        }
      );
      const body = await response.json();

      if (!response.ok) {
        setFormErrors(body.errors ?? {});
        setRedeemError(body.error ?? 'Could not redeem gift card.');
        if (body.giftCard) {
          setGiftCard(body.giftCard as GiftCard);
        }
        return;
      }

      setGiftCard(body.giftCard as GiftCard);
    } catch {
      setRedeemError('Network error while redeeming gift card. Please try again.');
    } finally {
      setRedeeming(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
            <Gift className="h-3.5 w-3.5" />
            Gift Card Redemption
          </span>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
            Redeem Your Tree Sponsorship Gift Card
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Enter your gift card code to claim and assign your sponsored tree.
          </p>
        </div>
        <Link
          href="/gift-cards"
          className="text-sm font-medium text-emerald-700 underline-offset-4 hover:underline"
        >
          Buy a gift card
        </Link>
      </div>

      <form
        onSubmit={handleLookupSubmit}
        className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
      >
        <label htmlFor="giftCardCode" className="block text-sm font-medium text-gray-700">
          Gift Card Code
        </label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <input
            id="giftCardCode"
            type="text"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            placeholder="TREE-XXXX-XXXX"
            className="flex-1 rounded-lg border border-gray-300 px-3.5 py-2.5 font-mono text-sm uppercase tracking-wider focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
          <button
            type="submit"
            disabled={loadingCard}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {loadingCard ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Find Gift Card
          </button>
        </div>
        {lookupError && <p className="mt-2 text-sm text-red-600">{lookupError}</p>}
      </form>

      {giftCard && (
        <section className="mt-6 space-y-6">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
                  From {giftCard.purchaserName}
                </p>
                <h2 className="mt-0.5 text-xl font-bold text-gray-900">
                  ${giftCard.amountUsd} USD · {giftCard.treeCount}{' '}
                  {giftCard.treeCount === 1 ? 'Sponsored Tree' : 'Sponsored Trees'}
                </h2>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  giftCard.status === 'redeemed'
                    ? 'bg-gray-200 text-gray-700'
                    : 'bg-emerald-600 text-white'
                }`}
              >
                {giftCard.status === 'redeemed' ? 'Redeemed' : 'Ready to Redeem'}
              </span>
            </div>

            {giftCard.personalMessage && (
              <blockquote className="mt-4 border-l-4 border-emerald-500 bg-white/80 px-4 py-3 text-sm italic text-gray-700">
                &ldquo;{giftCard.personalMessage}&rdquo;
              </blockquote>
            )}
          </div>

          {giftCard.status === 'redeemed' && giftCard.redemption ? (
            <div className="rounded-2xl border border-emerald-300 bg-white p-6 shadow-sm">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-6 w-6 text-emerald-600" />
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Your Sponsored {giftCard.treeCount === 1 ? 'Tree Is' : 'Trees Are'} Assigned!
                  </h3>
                  <p className="mt-1 text-sm text-gray-600">
                    Assigned to <span className="font-medium">{giftCard.redemption.redeemedByName}</span>{' '}
                    ({giftCard.redemption.species} in {giftCard.redemption.region}).
                  </p>
                  {giftCard.redemption.treeName && (
                    <p className="mt-1 text-sm text-gray-600">
                      Dedication: <span className="font-medium">{giftCard.redemption.treeName}</span>
                    </p>
                  )}

                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Assigned Tree IDs
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {giftCard.redemption.assignedTreeIds.map((treeId) => (
                        <span
                          key={treeId}
                          className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1 font-mono text-xs font-semibold text-emerald-800"
                        >
                          <TreePine className="h-3.5 w-3.5" />
                          {treeId}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <form
              onSubmit={handleRedeemSubmit}
              className="space-y-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              <h3 className="text-lg font-semibold text-gray-900">
                Assign Your Sponsored {giftCard.treeCount === 1 ? 'Tree' : 'Trees'}
              </h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700" htmlFor="redeemedByName">
                    Your Name
                  </label>
                  <input
                    id="redeemedByName"
                    type="text"
                    required
                    value={form.redeemedByName}
                    onChange={(e) => setForm((prev) => ({ ...prev, redeemedByName: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                  {formErrors.redeemedByName && (
                    <p className="mt-1 text-xs text-red-600">{formErrors.redeemedByName}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700" htmlFor="redeemedByEmail">
                    Your Email
                  </label>
                  <input
                    id="redeemedByEmail"
                    type="email"
                    required
                    value={form.redeemedByEmail}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, redeemedByEmail: e.target.value }))
                    }
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                  {formErrors.redeemedByEmail && (
                    <p className="mt-1 text-xs text-red-600">{formErrors.redeemedByEmail}</p>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700" htmlFor="species">
                    Tree Species
                  </label>
                  <select
                    id="species"
                    value={form.species}
                    onChange={(e) => setForm((prev) => ({ ...prev, species: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  >
                    {GIFT_CARD_SPECIES.map((species) => (
                      <option key={species} value={species}>
                        {species}
                      </option>
                    ))}
                  </select>
                  {formErrors.species && (
                    <p className="mt-1 text-xs text-red-600">{formErrors.species}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700" htmlFor="region">
                    Planting Region
                  </label>
                  <select
                    id="region"
                    value={form.region}
                    onChange={(e) => setForm((prev) => ({ ...prev, region: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  >
                    {GIFT_CARD_REGIONS.map((region) => (
                      <option key={region} value={region}>
                        {region}
                      </option>
                    ))}
                  </select>
                  {formErrors.region && (
                    <p className="mt-1 text-xs text-red-600">{formErrors.region}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700" htmlFor="treeName">
                  Tree Dedication Name (optional)
                </label>
                <input
                  id="treeName"
                  type="text"
                  maxLength={80}
                  value={form.treeName}
                  onChange={(e) => setForm((prev) => ({ ...prev, treeName: e.target.value }))}
                  placeholder="e.g., Amara's Birthday Grove"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                {formErrors.treeName && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.treeName}</p>
                )}
              </div>

              {redeemError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {redeemError}
                </div>
              )}

              <button
                type="submit"
                disabled={redeeming}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {redeeming ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Assigning Your Tree...
                  </>
                ) : (
                  <>
                    <Sprout className="h-4 w-4" />
                    Redeem Gift Card &amp; Assign Tree
                  </>
                )}
              </button>
            </form>
          )}
        </section>
      )}
    </main>
  );
}

export default function GiftCardRedeemPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl px-4 py-10 text-sm text-gray-500">
          Loading gift card redemption...
        </div>
      }
    >
      <RedeemGiftCardContent />
    </Suspense>
  );
}
