'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  Filter,
  GraduationCap,
  Leaf,
  PlusCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Sprout,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/molecules/Card';
import { Badge } from '@/components/atoms/Badge';
import { Button } from '@/components/atoms/Button';
import {
  calculateImpactMetrics,
  calculateStewardDistribution,
  validateBenefactorWallet,
  type CreateReceiptInput,
  type TaxExemptImpactReceipt,
} from '@/lib/sponsor-receipts';
import { downloadTaxExemptReceiptPdf } from '@/lib/sponsor-receipt-pdf';

interface UiNotification {
  type: 'success' | 'error' | 'info';
  message: string;
}

export default function SponsorReceiptsPage() {
  const [receipts, setReceipts] = useState<TaxExemptImpactReceipt[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [notification, setNotification] = useState<UiNotification | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [taxYearFilter, setTaxYearFilter] = useState<string>('all');
  const [stewardFilter, setStewardFilter] = useState<string>('all');

  // Modals
  const [inspectAuditReceipt, setInspectAuditReceipt] = useState<TaxExemptImpactReceipt | null>(null);
  const [inspectStewardsReceipt, setInspectStewardsReceipt] = useState<TaxExemptImpactReceipt | null>(null);
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState<boolean>(false);

  // Form state for generating a receipt
  const [benefactorName, setBenefactorName] = useState<string>('Acme Corp');
  const [walletAddress, setWalletAddress] = useState<string>(
    'GACME1111111111111111111111111111111111111111111111111111111'
  );
  const [amountUsd, setAmountUsd] = useState<number>(25000);
  const [poolName, setPoolName] = useState<string>('Sub-Saharan Agroforestry & Urban Canopy Fund');
  const [formTaxYear, setFormTaxYear] = useState<number>(2026);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchReceipts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sponsor/receipts', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      const data = (await res.json()) as { receipts: TaxExemptImpactReceipt[] };
      setReceipts(data.receipts || []);
    } catch (err) {
      console.warn('[sponsor-receipts] Error fetching receipts list:', err);
      setNotification({
        type: 'error',
        message: 'Could not load receipts from the server. Using cached data if available.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchReceipts();
  }, [fetchReceipts]);

  // Derived filtered receipts
  const filteredReceipts = useMemo(() => {
    return receipts.filter((r) => {
      // Tax year
      if (taxYearFilter !== 'all' && r.taxYear.toString() !== taxYearFilter) {
        return false;
      }
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          r.receiptNumber.toLowerCase().includes(q) ||
          r.benefactor.organizationName.toLowerCase().includes(q) ||
          r.benefactor.walletAddress.toLowerCase().includes(q) ||
          r.endowment.poolName.toLowerCase().includes(q) ||
          r.endowment.txHash.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [receipts, taxYearFilter, searchQuery]);

  // Summary Metrics
  const summaryTotals = useMemo(() => {
    const totalEndowments = filteredReceipts.reduce((acc, r) => acc + r.endowment.fiatValueUsd, 0);
    const totalCo2 = filteredReceipts.reduce((acc, r) => acc + r.impact.co2OffsetTonnes, 0);
    const totalTrees = filteredReceipts.reduce((acc, r) => acc + r.impact.treesFunded, 0);
    const totalStewards = filteredReceipts.reduce((acc, r) => acc + r.stewards.totalRecipients, 0);
    return { totalEndowments, totalCo2, totalTrees, totalStewards };
  }, [filteredReceipts]);

  // Handle PDF Download
  const handleDownloadPdf = useCallback(
    async (receipt: TaxExemptImpactReceipt) => {
      setDownloadingId(receipt.id);
      try {
        downloadTaxExemptReceiptPdf(receipt);
        setNotification({
          type: 'success',
          message: `Official tax-exempt impact receipt ${receipt.receiptNumber} successfully compiled and downloaded.`,
        });
      } catch (err) {
        console.warn(`[sponsor-receipts] Failed to generate PDF for ${receipt.receiptNumber}:`, err);
        setNotification({
          type: 'error',
          message: `PDF generation failed for receipt ${receipt.receiptNumber}. Please retry.`,
        });
      } finally {
        setDownloadingId(null);
      }
    },
    []
  );

  // Handle Receipt Creation
  const handleCreateReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validate wallet with @stellar/stellar-sdk StrKey
    if (!validateBenefactorWallet(walletAddress)) {
      const msg = 'Please enter a valid Stellar Ed25519 public key (starts with G, 56 characters).';
      console.warn(`[sponsor-receipts] Invalid wallet address entered: ${walletAddress}`);
      setFormError(msg);
      return;
    }

    if (amountUsd <= 0) {
      setFormError('Endowment amount must be greater than zero.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: CreateReceiptInput = {
        benefactorName,
        walletAddress,
        amountUsd,
        poolName,
        taxYear: formTaxYear,
        token: 'USDC',
      };

      const res = await fetch('/api/sponsor/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed with status ${res.status}`);
      }

      const { receipt } = (await res.json()) as { receipt: TaxExemptImpactReceipt };
      setReceipts((prev) => [receipt, ...prev]);
      setIsGenerateModalOpen(false);
      setNotification({
        type: 'success',
        message: `Audited tax-exempt receipt ${receipt.receiptNumber} issued and sealed on Stellar ledger.`,
      });
      // Automatically prompt PDF download
      downloadTaxExemptReceiptPdf(receipt);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to issue tax-exempt receipt.';
      console.warn('[sponsor-receipts] Issue receipt error:', msg);
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Preview steward allocation for modal
  const previewStewardDistribution = useMemo(() => {
    return calculateStewardDistribution(amountUsd || 0);
  }, [amountUsd]);

  const previewImpact = useMemo(() => {
    return calculateImpactMetrics(amountUsd || 0);
  }, [amountUsd]);

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* Header & Title */}
      <header className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              501(c)(3) Tax-Exempt Audited Proofs
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
              Stellar & Soroban Endowments
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Corporate Tax-Exempt Impact Receipts
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate and export audited proof of charitable environmental endowments. Rewards are
            distributed across smallholder farmers and non-farmer stewards (urban planters, schools,
            and verifiers).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchReceipts()}
            disabled={loading}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </Button>

          <Button
            size="sm"
            onClick={() => setIsGenerateModalOpen(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <PlusCircle className="h-4 w-4" aria-hidden="true" />
            Issue Tax Receipt
          </Button>
        </div>
      </header>

      {/* Accessible User-Facing UI Notification */}
      {notification && (
        <div
          role="status"
          aria-live="polite"
          className={`flex items-start justify-between rounded-lg border p-4 text-sm transition-all ${
            notification.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
              : notification.type === 'error'
                ? 'border-red-500/30 bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-200'
                : 'border-blue-500/30 bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            ) : notification.type === 'error' ? (
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" aria-hidden="true" />
            ) : (
              <FileCheck2 className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-xs font-semibold underline hover:opacity-75 ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Endowment impact totals">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium">TOTAL TAX DEDUCTIONS</CardDescription>
            <CardTitle className="text-2xl font-bold text-foreground">
              ${summaryTotals.totalEndowments.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Qualified 501(c)(3) charitable environmental endowments
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium">CARBON IMPACT FUNDED</CardDescription>
            <CardTitle className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {summaryTotals.totalCo2.toFixed(1)} tCO2e
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {summaryTotals.totalTrees.toLocaleString('en-US')} native trees actively verified
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium">STEWARDS REWARDED</CardDescription>
            <CardTitle className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {summaryTotals.totalStewards.toLocaleString('en-US')} Stewards
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Farmers, urban planters, schools & field verifiers
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-medium">AUDIT INTEGRITY</CardDescription>
            <CardTitle className="text-2xl font-bold text-foreground flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-emerald-500" aria-hidden="true" />
              100% Sealed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              SHA-256 digests anchored on Stellar ledger
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Filter and Search Bar */}
      <section className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search by receipt #, benefactor, or hash..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border bg-background pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              aria-label="Search receipts"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Filter className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Tax Year:</span>
          </div>
          <select
            value={taxYearFilter}
            onChange={(e) => setTaxYearFilter(e.target.value)}
            className="rounded-lg border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
            aria-label="Filter receipts by tax year"
          >
            <option value="all">All Tax Years</option>
            <option value="2026">Tax Year 2026</option>
            <option value="2025">Tax Year 2025</option>
          </select>

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-2">
            <span>Steward Focus:</span>
          </div>
          <select
            value={stewardFilter}
            onChange={(e) => setStewardFilter(e.target.value)}
            className="rounded-lg border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
            aria-label="Filter receipts by steward focus"
          >
            <option value="all">All Steward Classes</option>
            <option value="farmers">Farmers (55%)</option>
            <option value="urban">Urban Planters (20%)</option>
            <option value="schools">Schools & Youth (15%)</option>
            <option value="verifiers">Verifiers & Audits (10%)</option>
          </select>
        </div>
      </section>

      {/* Receipts Table */}
      <section className="rounded-xl border bg-card shadow-sm overflow-hidden" aria-label="Receipts table">
        <div className="p-4 border-b">
          <h2 className="text-base font-semibold text-foreground">
            Audited Tax-Exempt Impact Receipts ({filteredReceipts.length})
          </h2>
          <p className="text-xs text-muted-foreground">
            IRS § 170 compliant receipts. Click &apos;Download PDF&apos; for the printable certificate.
          </p>
        </div>

        {filteredReceipts.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No tax-exempt impact receipts match your filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b bg-muted/40 font-semibold text-muted-foreground">
                  <th className="p-3.5">Receipt #</th>
                  <th className="p-3.5">Tax Year</th>
                  <th className="p-3.5">Corporate Benefactor</th>
                  <th className="p-3.5">Endowment (USD)</th>
                  <th className="p-3.5">Stewards Rewarded</th>
                  <th className="p-3.5">Ecological Impact</th>
                  <th className="p-3.5">Audit Status</th>
                  <th className="p-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredReceipts.map((receipt) => {
                  const shortWallet = `${receipt.benefactor.walletAddress.slice(0, 6)}...${receipt.benefactor.walletAddress.slice(-6)}`;
                  const isDownloading = downloadingId === receipt.id;

                  return (
                    <tr key={receipt.id} className="hover:bg-muted/20 transition-colors">
                      <td className="p-3.5 font-mono font-medium text-foreground">
                        {receipt.receiptNumber}
                      </td>
                      <td className="p-3.5">
                        <Badge variant="outline">{receipt.taxYear}</Badge>
                      </td>
                      <td className="p-3.5">
                        <div className="font-medium text-foreground">
                          {receipt.benefactor.organizationName}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono" title={receipt.benefactor.walletAddress}>
                          {shortWallet}
                        </div>
                      </td>
                      <td className="p-3.5">
                        <div className="font-semibold text-foreground">
                          ${receipt.endowment.fiatValueUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {receipt.endowment.tokenAmount.toLocaleString()} {receipt.endowment.token}
                        </div>
                      </td>
                      <td className="p-3.5">
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            onClick={() => setInspectStewardsReceipt(receipt)}
                            className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300"
                          >
                            <Sprout className="h-3 w-3" aria-hidden="true" />
                            Farmers 55%
                          </button>
                          <button
                            type="button"
                            onClick={() => setInspectStewardsReceipt(receipt)}
                            className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 hover:bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300"
                          >
                            <Building2 className="h-3 w-3" aria-hidden="true" />
                            Urban 20%
                          </button>
                          <button
                            type="button"
                            onClick={() => setInspectStewardsReceipt(receipt)}
                            className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 hover:bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300"
                          >
                            <GraduationCap className="h-3 w-3" aria-hidden="true" />
                            Schools 15%
                          </button>
                          <button
                            type="button"
                            onClick={() => setInspectStewardsReceipt(receipt)}
                            className="inline-flex items-center gap-1 rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 hover:bg-purple-100 dark:bg-purple-950/60 dark:text-purple-300"
                          >
                            <Users className="h-3 w-3" aria-hidden="true" />
                            Verifiers 10%
                          </button>
                        </div>
                      </td>
                      <td className="p-3.5">
                        <div className="font-medium text-foreground">
                          {receipt.impact.co2OffsetTonnes.toFixed(1)} tCO2e
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {receipt.impact.treesFunded.toLocaleString()} trees • {receipt.impact.biodiversityHectares.toFixed(1)} ha
                        </div>
                      </td>
                      <td className="p-3.5">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                          Audited
                        </span>
                      </td>
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setInspectAuditReceipt(receipt)}
                            title="Inspect On-chain Cryptographic Proof"
                            className="h-7 px-2 text-[11px]"
                          >
                            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 mr-1" aria-hidden="true" />
                            Proof
                          </Button>

                          <Button
                            size="sm"
                            onClick={() => void handleDownloadPdf(receipt)}
                            disabled={isDownloading}
                            className="h-7 px-2 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            <Download className={`h-3.5 w-3.5 mr-1 ${isDownloading ? 'animate-bounce' : ''}`} aria-hidden="true" />
                            PDF
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modal: Issue Tax Receipt */}
      {isGenerateModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="issue-receipt-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-xl rounded-xl border bg-card p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 id="issue-receipt-title" className="text-lg font-bold text-foreground flex items-center gap-2">
                <FileCheck2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                Issue Tax-Exempt Impact Receipt
              </h3>
              <button
                type="button"
                onClick={() => setIsGenerateModalOpen(false)}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateReceipt} className="space-y-4 pt-4">
              {formError && (
                <div role="alert" className="rounded-lg border border-red-500/30 bg-red-50 p-3 text-xs text-red-800 dark:bg-red-950/40 dark:text-red-200">
                  {formError}
                </div>
              )}

              <div>
                <label htmlFor="benefactor-name-input" className="block text-xs font-medium text-foreground">
                  Corporate Benefactor Name
                </label>
                <input
                  id="benefactor-name-input"
                  type="text"
                  required
                  value={benefactorName}
                  onChange={(e) => setBenefactorName(e.target.value)}
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label htmlFor="wallet-address-input" className="block text-xs font-medium text-foreground">
                  Stellar Wallet Address (Ed25519)
                </label>
                <input
                  id="wallet-address-input"
                  type="text"
                  required
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  placeholder="G..."
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-xs font-mono focus:ring-2 focus:ring-emerald-500"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Validates against @stellar/stellar-sdk StrKey standards.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="endowment-amount-input" className="block text-xs font-medium text-foreground">
                    Endowment Amount ($ USD)
                  </label>
                  <input
                    id="endowment-amount-input"
                    type="number"
                    min="100"
                    step="100"
                    required
                    value={amountUsd}
                    onChange={(e) => setAmountUsd(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label htmlFor="tax-year-input" className="block text-xs font-medium text-foreground">
                    Tax Reporting Year
                  </label>
                  <select
                    id="tax-year-input"
                    value={formTaxYear}
                    onChange={(e) => setFormTaxYear(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value={2026}>2026</option>
                    <option value={2025}>2025</option>
                    <option value={2024}>2024</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="pool-name-input" className="block text-xs font-medium text-foreground">
                  Endowment Pool / Purpose
                </label>
                <input
                  id="pool-name-input"
                  type="text"
                  required
                  value={poolName}
                  onChange={(e) => setPoolName(e.target.value)}
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Real-time Allocation Preview */}
              <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
                <h4 className="text-xs font-semibold text-foreground flex items-center justify-between">
                  <span>Equitable Steward Allocation Breakdown</span>
                  <span className="text-[11px] font-normal text-muted-foreground">
                    {previewStewardDistribution.totalRecipients} Total Stewards
                  </span>
                </h4>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2 rounded bg-background border">
                    <div className="font-semibold text-emerald-600 dark:text-emerald-400">Farmers (55%)</div>
                    <div>${previewStewardDistribution.farmers.amountUsd.toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground">{previewStewardDistribution.farmers.count} smallholders</div>
                  </div>
                  <div className="p-2 rounded bg-background border">
                    <div className="font-semibold text-blue-600 dark:text-blue-400">Urban Planters (20%)</div>
                    <div>${previewStewardDistribution.urbanPlanters.amountUsd.toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground">{previewStewardDistribution.urbanPlanters.count} nurseries</div>
                  </div>
                  <div className="p-2 rounded bg-background border">
                    <div className="font-semibold text-amber-600 dark:text-amber-400">Community Schools (15%)</div>
                    <div>${previewStewardDistribution.communitySchools.amountUsd.toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground">{previewStewardDistribution.communitySchools.count} school guilds</div>
                  </div>
                  <div className="p-2 rounded bg-background border">
                    <div className="font-semibold text-purple-600 dark:text-purple-400">Verifiers & Bounties (10%)</div>
                    <div>${previewStewardDistribution.verifiers.amountUsd.toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground">{previewStewardDistribution.verifiers.count} audits</div>
                  </div>
                </div>

                <div className="pt-2 border-t text-[11px] text-muted-foreground flex justify-between">
                  <span>Projected Ecological Outcome:</span>
                  <span className="font-semibold text-foreground">
                    {previewImpact.co2OffsetTonnes} tCO2e • {previewImpact.treesFunded.toLocaleString()} trees
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsGenerateModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {isSubmitting ? 'Sealing on Ledger…' : 'Generate & Download PDF'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Audit Proof & Cryptographic Details */}
      {inspectAuditReceipt && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="audit-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 id="audit-modal-title" className="text-base font-bold text-foreground flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                Audited On-Chain Cryptographic Proof
              </h3>
              <button
                type="button"
                onClick={() => setInspectAuditReceipt(null)}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 pt-4 text-xs">
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 p-3 text-emerald-800 dark:text-emerald-200">
                <p className="font-semibold">501(c)(3) Charitable Environmental Endowment</p>
                <p className="mt-1 text-[11px]">
                  Receipt #{inspectAuditReceipt.receiptNumber} is cryptographically anchored to the Stellar ledger and substantiated under IRC § 170.
                </p>
              </div>

              <div>
                <span className="text-muted-foreground block font-medium">CANONICAL SHA-256 DIGEST</span>
                <div className="mt-1 p-2 rounded bg-muted/50 font-mono text-[11px] break-all border select-all">
                  {inspectAuditReceipt.audit.cryptographicDigest}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-muted-foreground block font-medium">STELLAR TRANSACTION HASH</span>
                  <div className="mt-1 p-2 rounded bg-muted/50 font-mono text-[11px] truncate border" title={inspectAuditReceipt.endowment.txHash}>
                    {inspectAuditReceipt.endowment.txHash}
                  </div>
                </div>

                <div>
                  <span className="text-muted-foreground block font-medium">SOROBAN STREAM ID</span>
                  <div className="mt-1 p-2 rounded bg-muted/50 font-mono text-[11px] border">
                    #{inspectAuditReceipt.endowment.streamId} (Ledger #{inspectAuditReceipt.endowment.ledger})
                  </div>
                </div>
              </div>

              <div>
                <span className="text-muted-foreground block font-medium">AUDITOR ATTESTATION</span>
                <p className="mt-1 text-[11px] text-foreground bg-muted/20 p-2 rounded border">
                  {inspectAuditReceipt.audit.attestation}
                </p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t">
                <a
                  href={inspectAuditReceipt.audit.explorerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  View on Stellar Explorer
                </a>

                <Button
                  size="sm"
                  onClick={() => {
                    void handleDownloadPdf(inspectAuditReceipt);
                    setInspectAuditReceipt(null);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <Download className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                  Download PDF
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Steward Rewards Detail */}
      {inspectStewardsReceipt && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="stewards-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-xl rounded-xl border bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 id="stewards-modal-title" className="text-base font-bold text-foreground flex items-center gap-2">
                <Users className="h-5 w-5 text-emerald-600" aria-hidden="true" />
                Steward Allocation: {inspectStewardsReceipt.receiptNumber}
              </h3>
              <button
                type="button"
                onClick={() => setInspectStewardsReceipt(null)}
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 pt-4 text-xs">
              <p className="text-muted-foreground">
                In Farm Credit, ecological impact credits are funded by benefactors to reward both farmers
                and non-farmer stewards (urban planters, community schools, verifiers).
              </p>

              <div className="space-y-2">
                {/* Farmers */}
                <div className="rounded-lg border p-3 bg-muted/20">
                  <div className="flex items-center justify-between font-semibold">
                    <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                      <Sprout className="h-4 w-4" aria-hidden="true" />
                      {inspectStewardsReceipt.stewards.farmers.title} (55%)
                    </span>
                    <span className="text-foreground">
                      ${inspectStewardsReceipt.stewards.farmers.amountUsd.toLocaleString()} USD
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {inspectStewardsReceipt.stewards.farmers.description}
                  </p>
                  <div className="mt-2 text-[10px] font-medium text-emerald-600">
                    {inspectStewardsReceipt.stewards.farmers.metrics}
                  </div>
                </div>

                {/* Urban Planters */}
                <div className="rounded-lg border p-3 bg-muted/20">
                  <div className="flex items-center justify-between font-semibold">
                    <span className="flex items-center gap-1.5 text-blue-700 dark:text-blue-300">
                      <Building2 className="h-4 w-4" aria-hidden="true" />
                      {inspectStewardsReceipt.stewards.urbanPlanters.title} (20%)
                    </span>
                    <span className="text-foreground">
                      ${inspectStewardsReceipt.stewards.urbanPlanters.amountUsd.toLocaleString()} USD
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {inspectStewardsReceipt.stewards.urbanPlanters.description}
                  </p>
                  <div className="mt-2 text-[10px] font-medium text-blue-600">
                    {inspectStewardsReceipt.stewards.urbanPlanters.metrics}
                  </div>
                </div>

                {/* Community Schools */}
                <div className="rounded-lg border p-3 bg-muted/20">
                  <div className="flex items-center justify-between font-semibold">
                    <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
                      <GraduationCap className="h-4 w-4" aria-hidden="true" />
                      {inspectStewardsReceipt.stewards.communitySchools.title} (15%)
                    </span>
                    <span className="text-foreground">
                      ${inspectStewardsReceipt.stewards.communitySchools.amountUsd.toLocaleString()} USD
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {inspectStewardsReceipt.stewards.communitySchools.description}
                  </p>
                  <div className="mt-2 text-[10px] font-medium text-amber-600">
                    {inspectStewardsReceipt.stewards.communitySchools.metrics}
                  </div>
                </div>

                {/* Verifiers */}
                <div className="rounded-lg border p-3 bg-muted/20">
                  <div className="flex items-center justify-between font-semibold">
                    <span className="flex items-center gap-1.5 text-purple-700 dark:text-purple-300">
                      <Users className="h-4 w-4" aria-hidden="true" />
                      {inspectStewardsReceipt.stewards.verifiers.title} (10%)
                    </span>
                    <span className="text-foreground">
                      ${inspectStewardsReceipt.stewards.verifiers.amountUsd.toLocaleString()} USD
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {inspectStewardsReceipt.stewards.verifiers.description}
                  </p>
                  <div className="mt-2 text-[10px] font-medium text-purple-600">
                    {inspectStewardsReceipt.stewards.verifiers.metrics}
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setInspectStewardsReceipt(null)}
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
