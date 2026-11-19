'use client';

import { useState, useMemo, useEffect, type JSX } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/atoms/Card';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Badge } from '@/components/atoms/Badge';
import { Text } from '@/components/atoms/Text';
import { useWalletContext } from '@/contexts/WalletContext';
import {
  calculateBulkPricing,
  VOLUME_DISCOUNT_TIERS,
  BULK_MIN_TONS,
  type BulkPurchaseAgreement,
} from '@/lib/marketplace/bulkPurchasing';

export default function BulkPurchasingPage(): JSX.Element {
  const { wallet } = useWalletContext();
  const [tons, setTons] = useState<number>(150);
  const [basePrice, setBasePrice] = useState<number>(45);
  const [useNegotiatedRate, setUseNegotiatedRate] = useState<boolean>(false);
  const [negotiatedRate, setNegotiatedRate] = useState<number>(38);
  const [agreements, setAgreements] = useState<BulkPurchaseAgreement[]>([]);
  const [activeTab, setActiveTab] = useState<'calculator' | 'agreements' | 'new-agreement'>('calculator');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // New agreement form state
  const [agreementForm, setAgreementForm] = useState({
    farmerAddress: 'GBTY4NZN2U4W7UUG6OXQ6K3YJ3KVRQZ2W5T4WJJL32OEVH2K2ZVRJ6QO',
    farmerName: 'Samuel Kiprop',
    farmName: 'Rift Valley Agroforestry Cooperative',
    region: 'Nakuru, Kenya',
    projectId: 'proj-005',
    projectName: 'Sustainable Agriculture - Kenya',
    committedTons: 200,
    negotiatedPricePerTon: 36,
    deliverySchedule: 'quarterly' as const,
    settlementMethod: 'escrow_milestone' as const,
    notes: 'Direct 100+ ton batch agreement for 2026 planting season.',
  });

  const pricing = useMemo(() => {
    return calculateBulkPricing(
      tons,
      basePrice,
      useNegotiatedRate ? negotiatedRate : undefined
    );
  }, [tons, basePrice, useNegotiatedRate, negotiatedRate]);

  useEffect(() => {
    fetch('/api/v2/marketplace/bulk/agreements')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.agreements) {
          setAgreements(data.agreements);
        }
      })
      .catch((err) => console.warn('Could not load bulk agreements', err));
  }, []);

  const handleCreateAgreement = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch('/api/v2/marketplace/bulk/agreements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyer: {
            walletAddress: wallet?.publicKey || 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVVO5',
            organizationName: 'Corporate Buyer Partner',
            contactEmail: 'procurement@carbonbuyer.org',
          },
          farmer: {
            walletAddress: agreementForm.farmerAddress,
            name: agreementForm.farmerName,
            farmName: agreementForm.farmName,
            region: agreementForm.region,
          },
          projectId: agreementForm.projectId,
          projectName: agreementForm.projectName,
          committedTons: agreementForm.committedTons,
          standardPricePerTon: basePrice,
          negotiatedPricePerTon: agreementForm.negotiatedPricePerTon,
          terms: {
            deliverySchedule: agreementForm.deliverySchedule,
            settlementMethod: agreementForm.settlementMethod,
            notes: agreementForm.notes,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create agreement');
      }

      setAgreements((prev) => [data.agreement, ...prev]);
      setMessage({ type: 'success', text: `Agreement ${data.agreement.id} created successfully!` });
      setActiveTab('agreements');
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Error creating agreement' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-6xl px-4 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-6">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-stellar-blue text-stellar-blue bg-stellar-blue/10">
                Marketplace v2
              </Badge>
              <span className="text-xs text-muted-foreground">Institutional & Corporate Trading</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground mt-2">
              Buyer Bulk Purchasing & Volume Discounts
            </h1>
            <p className="text-muted-foreground text-sm max-w-2xl mt-1">
              Purchase 100+ metric ton carbon credit batches at automatic volume discounts or establish negotiated forward purchase agreements directly with farmers.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={activeTab === 'calculator' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('calculator')}
            >
              📊 Discount Engine
            </Button>
            <Button
              variant={activeTab === 'agreements' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab('agreements')}
            >
              📑 Agreements ({agreements.length})
            </Button>
            <Button
              variant={activeTab === 'new-agreement' ? 'default' : 'outline'}
              size="sm"
              stellar="primary"
              onClick={() => setActiveTab('new-agreement')}
            >
              + Create Agreement
            </Button>
          </div>
        </div>

        {message && (
          <div
            className={`p-4 rounded-lg border text-sm ${
              message.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-500 text-emerald-700 dark:text-emerald-400'
                : 'bg-rose-50 dark:bg-rose-950/20 border-rose-500 text-rose-700 dark:text-rose-400'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Tab 1: Calculator */}
        {activeTab === 'calculator' && (
          <div className="space-y-6">
            {/* Volume Tiers Banner */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {VOLUME_DISCOUNT_TIERS.map((tier) => {
                const isActive =
                  tons >= tier.minTons && (tier.maxTons === null || tons <= tier.maxTons);
                return (
                  <Card
                    key={tier.tierName}
                    className={`transition-all ${
                      isActive
                        ? 'border-stellar-blue shadow-md ring-2 ring-stellar-blue/20 bg-stellar-blue/5'
                        : 'border-border/60'
                    }`}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-center">
                        <Badge variant={isActive ? 'accent' : 'outline'}>{tier.badge}</Badge>
                        <span className="text-xs font-mono text-muted-foreground">
                          {tier.minTons} {tier.maxTons ? `- ${tier.maxTons}` : '+'} tonnes
                        </span>
                      </div>
                      <CardTitle className="text-base font-semibold mt-2">{tier.tierName}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground">
                      Automatic {tier.discountPercentage}% discount on high-volume batches with full on-chain provenance.
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Interactive Calculator Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2 border-border/70">
                <CardHeader>
                  <CardTitle className="text-lg">Configure Bulk Batch</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Tons Slider & Quick Select */}
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="font-medium text-foreground">Order Volume:</span>
                      <span className="font-bold text-stellar-blue">{tons} Tonnes CO₂</span>
                    </div>
                    <input
                      type="range"
                      min={50}
                      max={2000}
                      step={10}
                      value={tons}
                      onChange={(e) => setTons(Number(e.target.value))}
                      className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-stellar-blue"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>50t</span>
                      <span className="font-medium text-amber-500">100t (Bulk Threshold)</span>
                      <span>500t (Tier 2)</span>
                      <span>1,000t (Tier 3)</span>
                      <span>2,000t</span>
                    </div>

                    <div className="flex gap-2 mt-3">
                      {[100, 250, 500, 1000].map((preset) => (
                        <Button
                          key={preset}
                          variant={tons === preset ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setTons(preset)}
                          className="text-xs"
                        >
                          {preset}t
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Base Price & Negotiated Rate */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-border/40">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">
                        Catalog Base Price ($/t)
                      </label>
                      <Input
                        type="number"
                        value={basePrice}
                        onChange={(e) => setBasePrice(Number(e.target.value))}
                        min={1}
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-medium text-muted-foreground">
                          Negotiated Farmer Rate ($/t)
                        </label>
                        <button
                          type="button"
                          onClick={() => setUseNegotiatedRate(!useNegotiatedRate)}
                          className="text-xs text-stellar-blue hover:underline"
                        >
                          {useNegotiatedRate ? 'Disable custom' : 'Enable custom'}
                        </button>
                      </div>
                      <Input
                        type="number"
                        value={negotiatedRate}
                        disabled={!useNegotiatedRate}
                        onChange={(e) => setNegotiatedRate(Number(e.target.value))}
                        min={1}
                        placeholder="Negotiated rate"
                      />
                    </div>
                  </div>

                  {/* Threshold warning if under 100t */}
                  {tons < BULK_MIN_TONS && (
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-xs">
                      ⚠️ Current volume ({tons}t) is below the 100 ton bulk batch threshold. Volume discounts and bulk agreements start at 100+ metric tonnes.
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Summary Card */}
              <Card className="border-stellar-blue/30 bg-card/60 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Pricing Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Standard Rate:</span>
                      <span>${basePrice.toFixed(2)} / t</span>
                    </div>

                    <div className="flex justify-between text-muted-foreground">
                      <span>Effective Rate:</span>
                      <span className="font-semibold text-foreground">
                        ${pricing.effectivePricePerTon.toFixed(2)} / t
                      </span>
                    </div>

                    <div className="flex justify-between text-muted-foreground">
                      <span>Volume Discount:</span>
                      <span className="font-bold text-emerald-600">
                        {pricing.appliedDiscountPercentage}% OFF
                      </span>
                    </div>

                    <div className="flex justify-between text-muted-foreground">
                      <span>Standard Cost:</span>
                      <span className="line-through text-xs">
                        ${pricing.standardTotalUsd.toLocaleString()}
                      </span>
                    </div>

                    <div className="pt-3 border-t border-border/50 flex justify-between items-baseline">
                      <span className="font-bold text-foreground">Total Bulk Cost:</span>
                      <span className="text-2xl font-extrabold text-stellar-blue">
                        ${pricing.bulkTotalUsd.toLocaleString()}
                      </span>
                    </div>

                    {pricing.savingsUsd > 0 && (
                      <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-semibold text-center">
                        Total Corporate Savings: ${pricing.savingsUsd.toLocaleString()}
                      </div>
                    )}
                  </div>

                  <div className="pt-2">
                    <Button
                      stellar="primary"
                      className="w-full"
                      disabled={tons < BULK_MIN_TONS}
                      onClick={() => setActiveTab('new-agreement')}
                    >
                      Draft Bulk Agreement for {tons}t
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Tab 2: Agreements List */}
        {activeTab === 'agreements' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <Text variant="h3" as="h2" className="text-xl font-bold">
                Active Bulk Purchase Agreements
              </Text>
              <Button size="sm" onClick={() => setActiveTab('new-agreement')} stellar="primary">
                + New Agreement
              </Button>
            </div>

            {agreements.length === 0 ? (
              <div className="text-center py-12 border rounded-xl bg-card">
                <p className="text-muted-foreground text-sm">No bulk agreements found.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {agreements.map((agreement) => (
                  <Card key={agreement.id} className="border-border/60 hover:border-stellar-blue/40 transition-all">
                    <CardHeader className="pb-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-foreground">{agreement.projectName}</span>
                            <Badge variant="outline" className="font-mono text-xs">
                              {agreement.id}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Farmer: {agreement.farmer.name} ({agreement.farmer.farmName}, {agreement.farmer.region})
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={`capitalize self-start sm:self-auto ${
                            agreement.status === 'active'
                              ? 'border-emerald-500 text-emerald-600 bg-emerald-500/10'
                              : 'border-blue-500 text-blue-600 bg-blue-500/10'
                          }`}
                        >
                          ● {agreement.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="text-xs space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 rounded-lg bg-muted/40">
                        <div>
                          <span className="text-muted-foreground block">Batch Volume</span>
                          <span className="font-bold text-foreground">{agreement.committedTons} tonnes</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Negotiated Rate</span>
                          <span className="font-bold text-emerald-600">${agreement.negotiatedPricePerTon} / t</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Total Contract Value</span>
                          <span className="font-bold text-foreground">${agreement.totalValueUsd.toLocaleString()}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Settlement Method</span>
                          <span className="font-medium capitalize text-foreground">{agreement.terms.settlementMethod.replace('_', ' ')}</span>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row justify-between text-muted-foreground border-t border-border/30 pt-2 gap-1 font-mono text-[11px]">
                        <span>Contract Hash: {agreement.contractHash.slice(0, 24)}...</span>
                        <span>Created: {new Date(agreement.createdAt).toLocaleDateString()}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: New Agreement Form */}
        {activeTab === 'new-agreement' && (
          <Card className="max-w-2xl mx-auto border-border/70">
            <CardHeader>
              <CardTitle className="text-lg">Create Bulk Purchase Agreement with Farmer</CardTitle>
              <p className="text-xs text-muted-foreground">
                Commit to a 100+ ton batch directly with the producer with milestone escrow protection.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateAgreement} className="space-y-4 text-sm">
                <div>
                  <label className="text-xs font-semibold block mb-1">Committed Batch Volume (min 100 tonnes)</label>
                  <Input
                    type="number"
                    min={100}
                    value={agreementForm.committedTons}
                    onChange={(e) => setAgreementForm({ ...agreementForm, committedTons: Number(e.target.value) })}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold block mb-1">Farmer / Producer Name</label>
                    <Input
                      value={agreementForm.farmerName}
                      onChange={(e) => setAgreementForm({ ...agreementForm, farmerName: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1">Farm / Cooperative Name</label>
                    <Input
                      value={agreementForm.farmName}
                      onChange={(e) => setAgreementForm({ ...agreementForm, farmName: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold block mb-1">Farmer Stellar Wallet Address</label>
                  <Input
                    value={agreementForm.farmerAddress}
                    onChange={(e) => setAgreementForm({ ...agreementForm, farmerAddress: e.target.value })}
                    required
                    className="font-mono text-xs"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold block mb-1">Project Name</label>
                    <Input
                      value={agreementForm.projectName}
                      onChange={(e) => setAgreementForm({ ...agreementForm, projectName: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1">Negotiated Rate ($/t)</label>
                    <Input
                      type="number"
                      value={agreementForm.negotiatedPricePerTon}
                      onChange={(e) => setAgreementForm({ ...agreementForm, negotiatedPricePerTon: Number(e.target.value) })}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold block mb-1">Delivery Schedule</label>
                    <select
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                      value={agreementForm.deliverySchedule}
                      onChange={(e) => setAgreementForm({ ...agreementForm, deliverySchedule: e.target.value as any })}
                    >
                      <option value="immediate">Immediate Full Transfer</option>
                      <option value="quarterly">Quarterly Tranches</option>
                      <option value="harvest_cycle">Harvest Verification Milestones</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1">Settlement Method</label>
                    <select
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                      value={agreementForm.settlementMethod}
                      onChange={(e) => setAgreementForm({ ...agreementForm, settlementMethod: e.target.value as any })}
                    >
                      <option value="escrow_milestone">Escrow with Milestones</option>
                      <option value="upfront_discount">Direct Upfront Settlement</option>
                      <option value="tranche_on_delivery">Tranche upon Delivery</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-border/40">
                  <Button type="button" variant="outline" onClick={() => setActiveTab('calculator')}>
                    Cancel
                  </Button>
                  <Button type="submit" stellar="primary" disabled={isSubmitting}>
                    {isSubmitting ? 'Creating Agreement...' : 'Establish Agreement'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
