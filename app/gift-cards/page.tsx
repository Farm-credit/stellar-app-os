'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Check, Copy, Gift, Loader2, Mail, Sprout } from 'lucide-react';
import {
  GIFT_CARD_DENOMINATIONS,
  GIFT_CARD_MESSAGE_MAX_LENGTH,
  type GiftCard,
} from '@/lib/gift-cards/giftCard';

interface PurchaseFormState {
  denominationId: string;
  purchaserName: string;
  purchaserEmail: string;
  recipientName: string;
  recipientEmail: string;
  personalMessage: string;
}

interface PurchaseResult {
  giftCard: GiftCard;
  redeemUrl: string;
  emailSent: boolean;
}

const INITIAL_FORM: PurchaseFormState = {
  denominationId: GIFT_CARD_DENOMINATIONS[1].id,
  purchaserName: '',
  purchaserEmail: '',
  recipientName: '',
  recipientEmail: '',
  personalMessage: '',
};

export default function GiftCardsPurchasePage() {
  const [form, setForm] = useState<PurchaseFormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [requestError, setRequestError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [purchased, setPurchased] = useState<PurchaseResult | null>(null);
  const [copied, setCopied] = useState(false);

  const selectedDenomination =
    GIFT_CARD_DENOMINATIONS.find((d) => d.id === form.denominationId) ?? GIFT_CARD_DENOMINATIONS[0];

  function updateField<K extends keyof PurchaseFormState>(key: K, value: PurchaseFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setRequestError(null);
    setErrors({});

    try {
      const response = await fetch('/api/gift-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const body = await response.json();

      if (!response.ok) {
        setErrors(body.errors ?? {});
        setRequestError(body.error ?? 'Could not complete gift card purchase.');
        return;
      }

      setPurchased(body as PurchaseResult);
    } catch {
      setRequestError('Network error while purchasing gift card. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
            <Gift className="h-3.5 w-3.5" />
            Tree Sponsorship Gift Cards
          </span>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
            Gift a Sponsored Tree
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Choose a fixed denomination, add a personalised message, and deliver a redeemable tree
            sponsorship gift card straight to their inbox.
          </p>
        </div>
        <Link
          href="/gift-cards/redeem"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50"
        >
          <Sprout className="h-4 w-4" />
          Have a gift card? Redeem it
        </Link>
      </div>

      {purchased ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-emerald-600 p-2 text-white">
              <Check className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-gray-900">
                Gift Card Purchased Successfully!
              </h2>
              <p className="mt-1 text-sm text-gray-700">
                {purchased.emailSent ? (
                  <>
                    Delivered via email to{' '}
                    <span className="font-medium">{purchased.giftCard.recipientEmail}</span>.
                  </>
                ) : (
                  <>
                    Your gift card is ready for{' '}
                    <span className="font-medium">{purchased.giftCard.recipientName}</span>. Share
                    the code or redemption link below.
                  </>
                )}
              </p>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-emerald-200 bg-white p-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
                    Redemption Code
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <code className="text-lg font-bold tracking-wider text-gray-900">
                      {purchased.giftCard.code}
                    </code>
                    <button
                      type="button"
                      onClick={() => handleCopyCode(purchased.giftCard.code)}
                      className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-200 bg-white p-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
                    Value &amp; Impact
                  </p>
                  <p className="mt-1 text-lg font-bold text-emerald-700">
                    ${purchased.giftCard.amountUsd} USD · {purchased.giftCard.treeCount}{' '}
                    {purchased.giftCard.treeCount === 1 ? 'Tree' : 'Trees'}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href={`/gift-cards/redeem?code=${encodeURIComponent(purchased.giftCard.code)}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Open Redemption Page
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setPurchased(null);
                    setForm(INITIAL_FORM);
                  }}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Purchase Another Gift Card
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <div className="grid gap-8 lg:grid-cols-5">
          <form
            onSubmit={handleSubmit}
            className="space-y-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:col-span-3"
          >
            <div>
              <h2 className="text-base font-semibold text-gray-900">1. Choose a Denomination</h2>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {GIFT_CARD_DENOMINATIONS.map((denomination) => {
                  const selected = form.denominationId === denomination.id;
                  return (
                    <button
                      key={denomination.id}
                      type="button"
                      onClick={() => updateField('denominationId', denomination.id)}
                      className={`rounded-xl border p-3 text-left transition ${
                        selected
                          ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-500/30'
                          : 'border-gray-200 hover:border-emerald-300'
                      }`}
                    >
                      <div className="text-lg font-bold text-gray-900">${denomination.amountUsd}</div>
                      <div className="text-xs font-medium text-emerald-700">
                        {denomination.treeCount} {denomination.treeCount === 1 ? 'tree' : 'trees'}
                      </div>
                    </button>
                  );
                })}
              </div>
              {errors.denominationId && (
                <p className="mt-1 text-xs text-red-600">{errors.denominationId}</p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700" htmlFor="purchaserName">
                  Your Name
                </label>
                <input
                  id="purchaserName"
                  type="text"
                  required
                  value={form.purchaserName}
                  onChange={(e) => updateField('purchaserName', e.target.value)}
                  placeholder="Alex Rivera"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                {errors.purchaserName && (
                  <p className="mt-1 text-xs text-red-600">{errors.purchaserName}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700" htmlFor="purchaserEmail">
                  Your Email
                </label>
                <input
                  id="purchaserEmail"
                  type="email"
                  required
                  value={form.purchaserEmail}
                  onChange={(e) => updateField('purchaserEmail', e.target.value)}
                  placeholder="alex@example.com"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                {errors.purchaserEmail && (
                  <p className="mt-1 text-xs text-red-600">{errors.purchaserEmail}</p>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700" htmlFor="recipientName">
                  Recipient Name
                </label>
                <input
                  id="recipientName"
                  type="text"
                  required
                  value={form.recipientName}
                  onChange={(e) => updateField('recipientName', e.target.value)}
                  placeholder="Amara Okafor"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                {errors.recipientName && (
                  <p className="mt-1 text-xs text-red-600">{errors.recipientName}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700" htmlFor="recipientEmail">
                  Recipient Email
                </label>
                <input
                  id="recipientEmail"
                  type="email"
                  required
                  value={form.recipientEmail}
                  onChange={(e) => updateField('recipientEmail', e.target.value)}
                  placeholder="amara@example.com"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
                {errors.recipientEmail && (
                  <p className="mt-1 text-xs text-red-600">{errors.recipientEmail}</p>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700" htmlFor="personalMessage">
                  Personalised Message (optional)
                </label>
                <span className="text-xs text-gray-500">
                  {form.personalMessage.length}/{GIFT_CARD_MESSAGE_MAX_LENGTH}
                </span>
              </div>
              <textarea
                id="personalMessage"
                rows={3}
                maxLength={GIFT_CARD_MESSAGE_MAX_LENGTH}
                value={form.personalMessage}
                onChange={(e) => updateField('personalMessage', e.target.value)}
                placeholder="Happy birthday! May your tree grow tall and strong."
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
              {errors.personalMessage && (
                <p className="mt-1 text-xs text-red-600">{errors.personalMessage}</p>
              )}
            </div>

            {requestError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {requestError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing Gift Card...
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4" />
                  Purchase &amp; Email ${selectedDenomination.amountUsd} Gift Card
                </>
              )}
            </button>
          </form>

          <aside className="lg:col-span-2">
            <div className="sticky top-6 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-700 to-teal-800 p-6 text-white shadow-md">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-100">
                  <Sprout className="h-4 w-4" />
                  Harvesta Gift Card
                </span>
                <span className="rounded-full bg-white/15 px-3 py-1 text-sm font-bold">
                  ${selectedDenomination.amountUsd}
                </span>
              </div>

              <div className="mt-6">
                <p className="text-xs uppercase tracking-wider text-emerald-200">For</p>
                <p className="text-xl font-bold">{form.recipientName.trim() || 'Your Recipient'}</p>
              </div>

              <div className="mt-4 rounded-xl bg-white/10 p-3 text-sm text-emerald-50">
                <p className="font-medium">
                  Good for {selectedDenomination.treeCount}{' '}
                  {selectedDenomination.treeCount === 1 ? 'sponsored tree' : 'sponsored trees'}
                </p>
                <p className="mt-1 text-xs text-emerald-100">{selectedDenomination.description}</p>
              </div>

              {form.personalMessage.trim() && (
                <blockquote className="mt-4 border-l-2 border-emerald-300 pl-3 text-sm italic text-emerald-50">
                  &ldquo;{form.personalMessage.trim()}&rdquo;
                </blockquote>
              )}

              <div className="mt-6 flex items-center justify-between border-t border-white/15 pt-4 text-xs text-emerald-100">
                <span>From: {form.purchaserName.trim() || 'You'}</span>
                <span>Delivered via email</span>
              </div>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}
