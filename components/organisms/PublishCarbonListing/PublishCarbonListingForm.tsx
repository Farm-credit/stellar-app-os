// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/molecules/Card';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { useWalletContext } from '@/contexts/WalletContext';
import type {
  CreditTypeCategory,
  VerificationMethod,
  PublishedListing,
} from '@/lib/types/carbon-listing-publish';

const CREDIT_TYPES: CreditTypeCategory[] = [
  'Soil Carbon',
  'Reforestation & Afforestation',
  'Blue Carbon (Mangroves)',
  'Agroforestry & Silvopasture',
  'Renewable Energy & Biochar',
];

const VERIFICATION_METHODS: VerificationMethod[] = [
  'Verra (VCS)',
  'Gold Standard',
  'Climate Action Reserve',
  'Plan Vivo',
  'Regenerative Organic Certified',
];

const VERIFIED_PROJECTS_PRESET = [
  {
    id: 'VCS-1940',
    name: 'East Africa Community Reforestation & Soil Sequestration',
    defaultType: 'Reforestation & Afforestation' as CreditTypeCategory,
    defaultMethod: 'Verra (VCS)' as VerificationMethod,
    availableTonnes: 108000,
    suggestedPrice: 24.5,
  },
  {
    id: 'GS-4820',
    name: 'Rift Valley Smallholder Agroforestry & Carbon Sink',
    defaultType: 'Agroforestry & Silvopasture' as CreditTypeCategory,
    defaultMethod: 'Gold Standard' as VerificationMethod,
    availableTonnes: 63500,
    suggestedPrice: 28.0,
  },
  {
    id: 'ROC-2024',
    name: 'Kilimanjaro Regenerative Agriculture & Soil Sequestration',
    defaultType: 'Soil Carbon' as CreditTypeCategory,
    defaultMethod: 'Regenerative Organic Certified' as VerificationMethod,
    availableTonnes: 34200,
    suggestedPrice: 26.0,
  },
];

export function PublishCarbonListingForm() {
  const { wallet } = useWalletContext();

  const [projectId, setProjectId] = useState(VERIFIED_PROJECTS_PRESET[0].id);
  const [projectName, setProjectName] = useState(VERIFIED_PROJECTS_PRESET[0].name);
  const [landManagerName, setLandManagerName] = useState('Highland Carbon Stewards');
  const [creditType, setCreditType] = useState<CreditTypeCategory>(
    VERIFIED_PROJECTS_PRESET[0].defaultType
  );
  const [verificationMethod, setVerificationMethod] = useState<VerificationMethod>(
    VERIFIED_PROJECTS_PRESET[0].defaultMethod
  );
  const [quantityTonnes, setQuantityTonnes] = useState<number>(500);
  const [pricePerTon, setPricePerTon] = useState<number>(
    VERIFIED_PROJECTS_PRESET[0].suggestedPrice
  );
  const [currency, setCurrency] = useState('USD');
  const [vintageYear, setVintageYear] = useState<number>(2024);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [publishedListing, setPublishedListing] = useState<PublishedListing | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleProjectSelect = (projId: string) => {
    setProjectId(projId);
    const preset = VERIFIED_PROJECTS_PRESET.find((p) => p.id === projId);
    if (preset) {
      setProjectName(preset.name);
      setCreditType(preset.defaultType);
      setVerificationMethod(preset.defaultMethod);
      setPricePerTon(preset.suggestedPrice);
    }
  };

  const grossTotal = (quantityTonnes || 0) * (pricePerTon || 0);
  const platformFee = grossTotal * 0.025; // 2.5% protocol fee
  const netEarnings = grossTotal - platformFee;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const sellerAddress =
      wallet?.publicKey || 'GBZXN7PIRZGNMHGA72XZQGBG66AGDCKTHJNRQ6T6O4B37666U2N2C62Z';

    if (!quantityTonnes || quantityTonnes <= 0) {
      setErrorMessage('Please enter a valid quantity of carbon credits in tons.');
      return;
    }
    if (!pricePerTon || pricePerTon <= 0) {
      setErrorMessage('Please enter a valid price per ton.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/v2/marketplace/listings/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          projectName,
          sellerAddress,
          landManagerName,
          creditType,
          quantityTonnes,
          pricePerTon,
          currency,
          verificationMethod,
          vintageYear,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to publish listing');
      }

      const result: PublishedListing = await response.json();
      setPublishedListing(result);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (publishedListing) {
    return (
      <Card className="border-emerald-500/40 bg-card shadow-xl max-w-3xl mx-auto">
        <CardContent className="p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-md">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <div className="space-y-2">
            <Text variant="h2" as="h2" className="text-2xl font-bold text-foreground">
              Carbon Credit Listing Published!
            </Text>
            <p className="text-sm text-muted-foreground">
              Your credits from verified project <span className="font-semibold text-foreground">{publishedListing.projectName}</span> are now active on the marketplace.
            </p>
          </div>

          <div className="bg-muted/40 rounded-xl p-5 text-left text-sm space-y-2.5 max-w-xl mx-auto border border-border/50">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Listing ID:</span>
              <span className="font-mono font-semibold">{publishedListing.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Credit Type:</span>
              <span className="font-semibold text-foreground">{publishedListing.creditType}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Verification Method:</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {publishedListing.verificationMethod}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Listed Quantity:</span>
              <span className="font-semibold">{publishedListing.quantityTonnes.toLocaleString()} metric tons</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Price per Ton:</span>
              <span className="font-semibold">${publishedListing.pricePerTon.toFixed(2)} USD</span>
            </div>
            <div className="flex justify-between border-t border-border/40 pt-2 font-bold">
              <span>Total Listing Value:</span>
              <span className="text-emerald-600">
                ${(publishedListing.quantityTonnes * publishedListing.pricePerTon).toLocaleString()} USD
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Button
              stellar="accent"
              onClick={() => {
                setPublishedListing(null);
                setQuantityTonnes(100);
              }}
            >
              Create Another Listing
            </Button>
            <Button variant="outline" onClick={() => (window.location.href = '/marketplace')}>
              Browse Marketplace
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8 max-w-4xl mx-auto">
      <Card className="border border-border/70 bg-card shadow-lg">
        <CardHeader className="border-b border-border/40 pb-5">
          <CardTitle className="text-xl sm:text-2xl font-bold">
            List Carbon Credits from Verified Projects (v2)
          </CardTitle>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Allow farmers and land managers to publish verified credits. Specify credit type, quantity, price per ton, and verification method.
          </p>
        </CardHeader>

        <CardContent className="p-6 sm:p-8 space-y-6">
          {errorMessage && (
            <div className="p-3.5 rounded-lg bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-900 text-sm">
              {errorMessage}
            </div>
          )}

          {/* Project Selection */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground flex items-center justify-between">
              <span>1. Verified Carbon Project</span>
              <span className="text-xs font-normal text-muted-foreground">Select from certified project registry</span>
            </label>
            <select
              className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              value={projectId}
              onChange={(e) => handleProjectSelect(e.target.value)}
            >
              {VERIFIED_PROJECTS_PRESET.map((proj) => (
                <option key={proj.id} value={proj.id}>
                  {proj.name} ({proj.id}) — {proj.defaultMethod}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Credit Type */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">
                2. Credit Type
              </label>
              <select
                className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                value={creditType}
                onChange={(e) => setCreditType(e.target.value as CreditTypeCategory)}
              >
                {CREDIT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Specifies carbon removal or sequestration classification
              </p>
            </div>

            {/* Verification Method */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">
                3. Verification Method
              </label>
              <select
                className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                value={verificationMethod}
                onChange={(e) => setVerificationMethod(e.target.value as VerificationMethod)}
              >
                {VERIFICATION_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Audit standard under which carbon reduction was registered
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Quantity in Tons */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">
                4. Quantity (Metric Tons)
              </label>
              <input
                type="number"
                min="1"
                step="1"
                className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                value={quantityTonnes}
                onChange={(e) => setQuantityTonnes(Number(e.target.value))}
                placeholder="e.g. 500"
                required
              />
              <p className="text-xs text-muted-foreground">Total tCO₂e credits to publish</p>
            </div>

            {/* Price Per Ton */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">
                5. Price Per Ton ({currency})
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                value={pricePerTon}
                onChange={(e) => setPricePerTon(Number(e.target.value))}
                placeholder="e.g. 24.50"
                required
              />
              <p className="text-xs text-muted-foreground">Asking price per metric ton</p>
            </div>

            {/* Vintage Year */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">
                Vintage Year
              </label>
              <input
                type="number"
                min="2020"
                max="2030"
                className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                value={vintageYear}
                onChange={(e) => setVintageYear(Number(e.target.value))}
                required
              />
              <p className="text-xs text-muted-foreground">Year credits were generated</p>
            </div>
          </div>

          {/* Land Manager Name */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-foreground">
              Farmer / Land Manager / Cooperative Name
            </label>
            <input
              type="text"
              className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              value={landManagerName}
              onChange={(e) => setLandManagerName(e.target.value)}
              placeholder="e.g. Highland Agroforestry Group"
              required
            />
          </div>

          {/* Financial Projection Summary */}
          <div className="p-5 rounded-xl bg-muted/40 border border-border/60 space-y-3">
            <h4 className="text-sm font-bold text-foreground">Financial & Settlement Summary</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-xs text-muted-foreground block">Gross Listing Value</span>
                <span className="text-lg font-bold text-foreground">
                  ${grossTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">Platform Protocol Fee (2.5%)</span>
                <span className="text-lg font-medium text-muted-foreground">
                  -${platformFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div>
                <span className="text-xs text-muted-foreground block">Estimated Net to Farmer</span>
                <span className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">
                  ${netEarnings.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              stellar="accent"
              disabled={isSubmitting}
              className="px-8 py-2.5 text-base font-semibold"
            >
              {isSubmitting ? 'Publishing to Marketplace...' : 'Create & Publish Listing'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
