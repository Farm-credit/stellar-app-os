'use client';

import React, { useMemo, useState } from 'react';
import { Building2, Check, Leaf, Sparkles, Trees } from 'lucide-react';
import {
  BULK_SPONSORSHIP_PACKAGES,
  calculateBulkOrderQuote,
  type BulkPackageQuantity,
  type CorporateOrder,
} from '@/lib/corporate-sponsorship/packages';

interface BulkOrderFlowProps {
  onOrderCreated: (order: CorporateOrder) => void;
}

export function BulkOrderFlow({ onOrderCreated }: BulkOrderFlowProps) {
  const [selectedQuantity, setSelectedQuantity] = useState<BulkPackageQuantity>(50);
  const [companyName, setCompanyName] = useState('');
  const [tagline, setTagline] = useState('Growing a Greener Future Together');
  const [contactEmail, setContactEmail] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#166534');
  const [secondaryColor, setSecondaryColor] = useState('#0f766e');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successOrder, setSuccessOrder] = useState<CorporateOrder | null>(null);

  const quote = useMemo(() => calculateBulkOrderQuote(selectedQuantity), [selectedQuantity]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessOrder(null);

    if (!companyName.trim()) {
      setError('Please enter your company name.');
      return;
    }
    if (!contactEmail.trim()) {
      setError('Please enter a valid corporate contact email.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/corporate-sponsorship/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity: selectedQuantity,
          branding: {
            companyName: companyName.trim(),
            tagline: tagline.trim(),
            primaryColor,
            secondaryColor,
            contactEmail: contactEmail.trim(),
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to place bulk sponsorship order.');
      }

      setSuccessOrder(data.order);
      onOrderCreated(data.order);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          1. Select a Bulk Sponsorship Package
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Choose a corporate tree package with automatic volume discounts.
        </p>

        <div
          className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
          role="radiogroup"
          aria-label="Bulk sponsorship package quantity"
        >
          {BULK_SPONSORSHIP_PACKAGES.map((pkg) => {
            const pkgQuote = calculateBulkOrderQuote(pkg.quantity);
            const isSelected = selectedQuantity === pkg.quantity;

            return (
              <button
                key={pkg.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setSelectedQuantity(pkg.quantity)}
                className={`relative flex flex-col justify-between rounded-xl border p-5 text-left transition-all ${
                  isSelected
                    ? 'border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-600/20 dark:border-emerald-400 dark:bg-emerald-950/30'
                    : 'border-gray-200 bg-white hover:border-emerald-300 dark:border-gray-800 dark:bg-gray-900'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                      <Trees className="h-4 w-4" />
                      {pkg.name}
                    </span>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300">
                      Save {pkg.discountPercent}%
                    </span>
                  </div>

                  <div className="mt-3 flex items-baseline gap-1.5">
                    <span className="text-3xl font-bold text-gray-900 dark:text-white">
                      {pkg.quantity}
                    </span>
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      trees
                    </span>
                  </div>

                  <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">{pkg.description}</p>

                  <ul className="mt-4 space-y-1.5 text-xs text-gray-700 dark:text-gray-300">
                    {pkg.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-1.5">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-5 border-t border-gray-200/80 pt-3 dark:border-gray-800">
                  <div className="flex items-baseline justify-between">
                    <span className="text-lg font-bold text-gray-900 dark:text-white">
                      ${pkgQuote.totalUsd.toLocaleString('en-US')}
                    </span>
                    <span className="text-xs text-gray-500 line-through">
                      ${pkgQuote.subtotalUsd.toLocaleString('en-US')}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    ${pkgQuote.discountedUnitPriceUsd.toFixed(2)} / tree ·{' '}
                    {pkgQuote.estimatedCo2KgPerYear.toLocaleString('en-US')} kg CO₂/yr
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 lg:col-span-2 dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              2. Corporate Branding &amp; Contact Details
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="corp-company-name"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Company Name *
              </label>
              <input
                id="corp-company-name"
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g., Horizon Sustainability Corp"
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-emerald-600 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
              />
            </div>

            <div>
              <label
                htmlFor="corp-contact-email"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Corporate Contact Email *
              </label>
              <input
                id="corp-contact-email"
                type="email"
                required
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="esg@company.com"
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-emerald-600 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="corp-tagline"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Certificate &amp; Dashboard Tagline
            </label>
            <input
              id="corp-tagline"
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Growing a Greener Future Together"
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-emerald-600 focus:outline-none dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="corp-primary-color"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Primary Brand Color
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  id="corp-primary-color"
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border border-gray-300 bg-transparent p-0.5"
                />
                <span className="font-mono text-xs text-gray-600 dark:text-gray-400">
                  {primaryColor}
                </span>
              </div>
            </div>

            <div>
              <label
                htmlFor="corp-secondary-color"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Secondary Brand Color
              </label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  id="corp-secondary-color"
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                  className="h-9 w-12 cursor-pointer rounded border border-gray-300 bg-transparent p-0.5"
                />
                <span className="font-mono text-xs text-gray-600 dark:text-gray-400">
                  {secondaryColor}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-gray-200 bg-gray-50 p-6 dark:border-gray-800 dark:bg-gray-900/60">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-600" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Order Summary
              </h3>
            </div>

            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-600 dark:text-gray-400">Package</dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100">
                  {quote.packageName} ({quote.quantity} trees)
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600 dark:text-gray-400">
                  Subtotal (${quote.baseUnitPriceUsd}/tree)
                </dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100">
                  ${quote.subtotalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </dd>
              </div>
              <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                <dt>Volume Discount ({quote.discountPercent}%)</dt>
                <dd className="font-semibold">
                  -${quote.discountAmountUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </dd>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-3 text-base font-bold dark:border-gray-700">
                <dt className="text-gray-900 dark:text-white">Total Due</dt>
                <dd className="text-gray-900 dark:text-white">
                  ${quote.totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </dd>
              </div>
            </dl>

            <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-100/70 p-3 text-xs text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200">
              <Leaf className="h-4 w-4 shrink-0" />
              <span>
                Estimated annual impact:{' '}
                <strong>{quote.estimatedCo2KgPerYear.toLocaleString('en-US')} kg CO₂</strong>
              </span>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {error && (
              <p className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-300">
                {error}
              </p>
            )}
            {successOrder && (
              <p className="rounded-lg bg-emerald-50 p-2.5 text-xs text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
                Order <strong>{successOrder.orderNumber}</strong> created!{' '}
                {successOrder.trees.length} trees added to your corporate dashboard.
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting
                ? 'Creating Bulk Order...'
                : `Sponsor ${quote.quantity} Trees — $${quote.totalUsd.toLocaleString('en-US')}`}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
