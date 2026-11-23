'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Leaf,
  PauseCircle,
  PlayCircle,
  Printer,
  RefreshCw,
  ShoppingCart,
  Target,
  XCircle,
} from 'lucide-react';
import type { AutoPurchaseRun, MonthlyReport, OffsetProgram } from '@/lib/corporate-offset';
import { formatMonthlyReportCsv, formatMonthlyReportMarkdown } from '@/lib/corporate-offset-docs';

interface ProgramProgress {
  cumulative: number;
  pctOfTarget: number;
  remaining: number;
}

interface InventoryItem {
  projectId: string;
  projectType: string;
  quantityTco2e: number;
  unitPrice: number;
  coBenefits: string[];
}

const PROJECT_TYPES = [
  'reforestation',
  'mangrove-restoration',
  'agroforestry',
  'biochar',
  'soil-carbon',
] as const;

const DEFAULT_INVENTORY: InventoryItem[] = [
  {
    projectId: 'PROJ-AMZ-001',
    projectType: 'reforestation',
    quantityTco2e: 250,
    unitPrice: 18.5,
    coBenefits: ['Biodiversity corridor', 'Local employment'],
  },
  {
    projectId: 'PROJ-MNG-004',
    projectType: 'mangrove-restoration',
    quantityTco2e: 180,
    unitPrice: 22.0,
    coBenefits: ['Coastal protection', 'Blue carbon'],
  },
  {
    projectId: 'PROJ-AGF-009',
    projectType: 'agroforestry',
    quantityTco2e: 300,
    unitPrice: 16.0,
    coBenefits: ['Soil health', 'Smallholder income'],
  },
];

function getDefaultPeriod(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function triggerDownload(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function CorporateOffsetTool() {
  const [activeTab, setActiveTab] = useState<'setup' | 'autopurchase' | 'reports'>('setup');

  // Enrollment / Target form state
  const [companyName, setCompanyName] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [annualTargetTco2e, setAnnualTargetTco2e] = useState('1200');
  const [autoPurchase, setAutoPurchase] = useState(true);
  const [monthlyBudgetCap, setMonthlyBudgetCap] = useState('2500');
  const [preferredTypes, setPreferredTypes] = useState<string[]>(['reforestation']);
  const [preferredProjectsInput, setPreferredProjectsInput] = useState('');
  const [netZeroPledge, setNetZeroPledge] = useState(true);
  const [targetYear, setTargetYear] = useState('2030');

  // Loaded program & progress state
  const [program, setProgram] = useState<OffsetProgram | null>(null);
  const [progress, setProgress] = useState<ProgramProgress | null>(null);
  const [inventory] = useState<InventoryItem[]>(DEFAULT_INVENTORY);
  const [lastRun, setLastRun] = useState<AutoPurchaseRun | null>(null);

  // Monthly reporting state
  const [reportPeriod, setReportPeriod] = useState(getDefaultPeriod());
  const [monthlyReport, setMonthlyReport] = useState<MonthlyReport | null>(null);

  // UI feedback state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function togglePreferredType(type: string) {
    setPreferredTypes((prev) =>
      prev.includes(type) ? prev.filter((item) => item !== type) : [...prev, type]
    );
  }

  async function refreshProgram(wallet: string) {
    const res = await fetch(`/api/offset-program?wallet=${encodeURIComponent(wallet)}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error ?? 'Failed to load offset program');
    }
    setProgram(data.program);
    setProgress(data.progress);
  }

  async function handleEnroll(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const preferredProjects = preferredProjectsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const payload = {
        companyName: companyName.trim(),
        companyEmail: companyEmail.trim(),
        walletAddress: walletAddress.trim(),
        annualTargetTco2e: Number(annualTargetTco2e),
        autoPurchase,
        monthlyBudgetCap: monthlyBudgetCap.trim() ? Number(monthlyBudgetCap) : null,
        preferredProjects,
        preferredTypes,
        netZeroPledge,
        targetYear: targetYear.trim() ? Number(targetYear) : null,
      };

      const res = await fetch('/api/offset-program', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to save offset program');
      }

      setProgram(data.program);
      await refreshProgram(payload.walletAddress);
      setNotice('Carbon offset target and auto-purchase configuration saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save program');
    } finally {
      setLoading(false);
    }
  }

  async function handleLookup() {
    if (!walletAddress.trim()) {
      setError('Enter a Stellar wallet address to load an existing program.');
      return;
    }
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      await refreshProgram(walletAddress.trim());
      setNotice('Loaded existing corporate carbon offset program.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Program lookup failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(status: OffsetProgram['status']) {
    if (!program) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/offset-program', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: program.walletAddress, status }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? 'Status update failed');
      }
      setProgram(data.program);
      setNotice(`Program status updated to ${status}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update status');
    } finally {
      setLoading(false);
    }
  }

  async function handleRunAutoPurchase() {
    const activeWallet = program?.walletAddress ?? walletAddress.trim();
    if (!activeWallet) {
      setError('Enroll or load a corporate program before running auto-purchase.');
      return;
    }
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/offset-program', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: activeWallet, inventory }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? 'Auto-purchase cycle failed');
      }
      setLastRun(data.run);
      await refreshProgram(activeWallet);
      setNotice(
        `Auto-purchase cycle complete: acquired ${data.run.purchasedTco2e.toFixed(2)} tCO2e for $${data.run.spent.toFixed(2)}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auto-purchase failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateReport() {
    const activeWallet = program?.walletAddress ?? walletAddress.trim();
    if (!activeWallet) {
      setError('Enroll or load a corporate program before generating a monthly report.');
      return;
    }
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const url = `/api/offset-program?wallet=${encodeURIComponent(activeWallet)}&report=1&period=${encodeURIComponent(reportPeriod)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to generate monthly report');
      }
      setProgram(data.program);
      setMonthlyReport(data.report);
      setNotice(`Monthly ESG report generated for ${reportPeriod}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Report generation failed');
    } finally {
      setLoading(false);
    }
  }

  function handleDownloadMarkdown() {
    if (!program || !monthlyReport) return;
    const md = formatMonthlyReportMarkdown(program, monthlyReport);
    triggerDownload(
      md,
      `carbon-offset-report-${monthlyReport.period.slice(0, 7)}.md`,
      'text/markdown;charset=utf-8'
    );
  }

  function handleDownloadCsv() {
    if (!program || !monthlyReport) return;
    const csv = formatMonthlyReportCsv(program, monthlyReport);
    triggerDownload(
      csv,
      `carbon-offset-report-${monthlyReport.period.slice(0, 7)}.csv`,
      'text/csv;charset=utf-8'
    );
  }

  function handleDownloadJson() {
    if (!program || !monthlyReport) return;
    const json = JSON.stringify({ program, report: monthlyReport }, null, 2);
    triggerDownload(
      json,
      `carbon-offset-report-${monthlyReport.period.slice(0, 7)}.json`,
      'application/json;charset=utf-8'
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
              <Leaf className="h-3.5 w-3.5" />
              Corporate Carbon Offset Program
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Carbon Offset Targets &amp; Automated Credit Purchasing
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Set annual tCO2e reduction targets, automate verified credit purchases within your
              monthly budget cap, and export audit-ready monthly ESG documentation.
            </p>
          </div>
          {program && (
            <div className="rounded-xl border border-emerald-200 bg-white px-4 py-3 text-right shadow-xs">
              <p className="text-xs font-medium text-slate-500">{program.companyName}</p>
              <p className="text-sm font-semibold text-emerald-700 uppercase">{program.status}</p>
            </div>
          )}
        </div>

        {/* Live Progress Bar */}
        {program && progress && (
          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-medium text-slate-700">
                Annual Target Progress ({progress.cumulative.toFixed(2)} /{' '}
                {program.annualTargetTco2e.toLocaleString()} tCO2e)
              </span>
              <span className="font-semibold text-emerald-700">
                {progress.pctOfTarget.toFixed(1)}%
              </span>
            </div>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-600 transition-all"
                style={{ width: `${Math.min(progress.pctOfTarget, 100)}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>Remaining: {progress.remaining.toFixed(2)} tCO2e</span>
              <div className="flex items-center gap-2">
                {program.status !== 'active' && (
                  <button
                    type="button"
                    onClick={() => handleStatusChange('active')}
                    disabled={loading}
                    className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700 hover:bg-emerald-100"
                  >
                    <PlayCircle className="h-3.5 w-3.5" /> Resume
                  </button>
                )}
                {program.status === 'active' && (
                  <button
                    type="button"
                    onClick={() => handleStatusChange('paused')}
                    disabled={loading}
                    className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 font-medium text-amber-700 hover:bg-amber-100"
                  >
                    <PauseCircle className="h-3.5 w-3.5" /> Pause
                  </button>
                )}
                {program.status !== 'cancelled' && (
                  <button
                    type="button"
                    onClick={() => handleStatusChange('cancelled')}
                    disabled={loading}
                    className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 font-medium text-rose-700 hover:bg-rose-100"
                  >
                    <XCircle className="h-3.5 w-3.5" /> Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Alerts */}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'setup'}
          onClick={() => setActiveTab('setup')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
            activeTab === 'setup'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <Target className="h-4 w-4" />
          1. Target &amp; Rules
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'autopurchase'}
          onClick={() => setActiveTab('autopurchase')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
            activeTab === 'autopurchase'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <ShoppingCart className="h-4 w-4" />
          2. Auto-Purchase Engine
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'reports'}
          onClick={() => setActiveTab('reports')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
            activeTab === 'reports'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          <FileText className="h-4 w-4" />
          3. Monthly Reports &amp; Docs
        </button>
      </div>

      {/* Tab 1: Target & Program Configuration */}
      {activeTab === 'setup' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Set Corporate Carbon Offset Target
              </h2>
              <p className="text-sm text-slate-500">
                Configure your annual tCO2e goal, monthly spend cap, and preferred project types.
              </p>
            </div>
            <button
              type="button"
              onClick={handleLookup}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Load Existing by Wallet
            </button>
          </div>

          <form onSubmit={handleEnroll} className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="companyName" className="block text-sm font-medium text-slate-700">
                Company Name
              </label>
              <input
                id="companyName"
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Acme Sustainability Corp"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="companyEmail" className="block text-sm font-medium text-slate-700">
                ESG Contact Email
              </label>
              <input
                id="companyEmail"
                type="email"
                required
                value={companyEmail}
                onChange={(e) => setCompanyEmail(e.target.value)}
                placeholder="esg@acme.com"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label htmlFor="walletAddress" className="block text-sm font-medium text-slate-700">
                Stellar Wallet Address
              </label>
              <input
                id="walletAddress"
                type="text"
                required
                minLength={40}
                maxLength={80}
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="G..."
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="annualTargetTco2e"
                className="block text-sm font-medium text-slate-700"
              >
                Annual Offset Target (tCO2e)
              </label>
              <input
                id="annualTargetTco2e"
                type="number"
                required
                min={1}
                step="any"
                value={annualTargetTco2e}
                onChange={(e) => setAnnualTargetTco2e(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="monthlyBudgetCap"
                className="block text-sm font-medium text-slate-700"
              >
                Monthly Budget Cap (USD, optional)
              </label>
              <input
                id="monthlyBudgetCap"
                type="number"
                min={1}
                step="any"
                value={monthlyBudgetCap}
                onChange={(e) => setMonthlyBudgetCap(e.target.value)}
                placeholder="Leave blank for no cap"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="targetYear" className="block text-sm font-medium text-slate-700">
                Net-Zero Target Year (optional)
              </label>
              <input
                id="targetYear"
                type="number"
                min={2026}
                max={2100}
                value={targetYear}
                onChange={(e) => setTargetYear(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="preferredProjects"
                className="block text-sm font-medium text-slate-700"
              >
                Preferred Project IDs (comma-separated)
              </label>
              <input
                id="preferredProjects"
                type="text"
                value={preferredProjectsInput}
                onChange={(e) => setPreferredProjectsInput(e.target.value)}
                placeholder="PROJ-AMZ-001, PROJ-MNG-004"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <span className="block text-sm font-medium text-slate-700">
                Preferred Project Types
              </span>
              <div className="mt-2 flex flex-wrap gap-2">
                {PROJECT_TYPES.map((type) => {
                  const selected = preferredTypes.includes(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => togglePreferredType(type)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                        selected
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {type}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-6 md:col-span-2">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={autoPurchase}
                  onChange={(e) => setAutoPurchase(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                />
                Enable automatic credit purchasing
              </label>

              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={netZeroPledge}
                  onChange={(e) => setNetZeroPledge(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                />
                Public Net-Zero Pledge
              </label>
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50"
              >
                <Target className="h-4 w-4" />
                {loading ? 'Saving...' : 'Save Offset Target & Program'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Tab 2: Automated Credit Purchase Engine */}
      {activeTab === 'autopurchase' && (
        <section className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Automated Credit Purchase Engine
              </h2>
              <p className="text-sm text-slate-500">
                Automatically prioritizes preferred projects and types, then fills by lowest unit
                price while enforcing your monthly budget cap and annual target.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRunAutoPurchase}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50"
            >
              <ShoppingCart className="h-4 w-4" />
              {loading ? 'Executing...' : 'Run Auto-Purchase Cycle'}
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-600">
                <tr>
                  <th className="px-4 py-3">Project ID</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Available (tCO2e)</th>
                  <th className="px-4 py-3">Unit Price (USD)</th>
                  <th className="px-4 py-3">Co-Benefits</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {inventory.map((item) => (
                  <tr key={item.projectId}>
                    <td className="px-4 py-3 font-mono text-xs font-medium text-slate-900">
                      {item.projectId}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{item.projectType}</td>
                    <td className="px-4 py-3 text-slate-700">{item.quantityTco2e}</td>
                    <td className="px-4 py-3 text-slate-700">${item.unitPrice.toFixed(2)}</td>
                    <td className="px-4 py-3 text-slate-600">{item.coBenefits.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {lastRun && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
              <h3 className="text-sm font-semibold text-emerald-900">
                Latest Auto-Purchase Run Summary
              </h3>
              <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-slate-500">Purchased</p>
                  <p className="text-lg font-bold text-slate-900">
                    {lastRun.purchasedTco2e.toFixed(2)} tCO2e
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Amount Spent</p>
                  <p className="text-lg font-bold text-slate-900">${lastRun.spent.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Remaining to Target</p>
                  <p className="text-lg font-bold text-slate-900">
                    {lastRun.remainingToTarget.toFixed(2)} tCO2e
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Target Status</p>
                  <p className="text-lg font-bold text-emerald-700">
                    {lastRun.targetMet ? 'Target Met' : 'In Progress'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Tab 3: Monthly Reporting & ESG Documentation */}
      {activeTab === 'reports' && (
        <section className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Monthly ESG Reporting &amp; Documentation
              </h2>
              <p className="text-sm text-slate-500">
                Generate monthly offset progress reports and export audit-ready documentation.
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="reportPeriod" className="block text-xs font-medium text-slate-600">
                  Reporting Period (YYYY-MM)
                </label>
                <input
                  id="reportPeriod"
                  type="month"
                  value={reportPeriod}
                  onChange={(e) => setReportPeriod(e.target.value)}
                  className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={handleGenerateReport}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <FileText className="h-4 w-4" />
                {loading ? 'Generating...' : 'Generate Monthly Report'}
              </button>
            </div>
          </div>

          {monthlyReport && program && (
            <div className="space-y-6 rounded-xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    Monthly Report — {monthlyReport.period.slice(0, 7)}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {program.companyName} · Pace:{' '}
                    <span
                      className={
                        monthlyReport.onTrack
                          ? 'font-semibold text-emerald-700'
                          : 'font-semibold text-amber-700'
                      }
                    >
                      {monthlyReport.onTrack ? 'On Track' : 'Behind Pace'}
                    </span>
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadMarkdown}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Markdown (.md)
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadCsv}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    CSV (.csv)
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadJson}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <Download className="h-3.5 w-3.5" />
                    JSON (.json)
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Print / PDF
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-lg bg-white p-3 shadow-2xs">
                  <p className="text-xs text-slate-500">Period Tonnes</p>
                  <p className="text-lg font-bold text-slate-900">
                    {monthlyReport.tonnesPurchased.toFixed(2)} tCO2e
                  </p>
                </div>
                <div className="rounded-lg bg-white p-3 shadow-2xs">
                  <p className="text-xs text-slate-500">Cumulative Tonnes</p>
                  <p className="text-lg font-bold text-slate-900">
                    {monthlyReport.tonnesCumulative.toFixed(2)} tCO2e
                  </p>
                </div>
                <div className="rounded-lg bg-white p-3 shadow-2xs">
                  <p className="text-xs text-slate-500">% of Annual Target</p>
                  <p className="text-lg font-bold text-emerald-700">
                    {monthlyReport.pctOfTarget.toFixed(2)}%
                  </p>
                </div>
                <div className="rounded-lg bg-white p-3 shadow-2xs">
                  <p className="text-xs text-slate-500">Period Spend</p>
                  <p className="text-lg font-bold text-slate-900">
                    ${monthlyReport.amountSpent.toFixed(2)}
                  </p>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Projects Supported
                </h4>
                {monthlyReport.projectsSupported.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">
                    No credit purchases recorded for this reporting period.
                  </p>
                ) : (
                  <ul className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                    {monthlyReport.projectsSupported.map((proj) => (
                      <li
                        key={proj.projectId}
                        className="flex items-center justify-between px-4 py-2.5 text-sm"
                      >
                        <span className="font-mono text-xs font-medium text-slate-800">
                          {proj.projectId}
                        </span>
                        <span className="font-semibold text-emerald-700">
                          {proj.tonnes.toFixed(2)} tCO2e
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
