'use client';

import { useState, useEffect, type JSX } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/atoms/Card';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Badge } from '@/components/atoms/Badge';
import { Text } from '@/components/atoms/Text';
import type {
  CorporateProgramRecord,
  EnrollCorporateProgramRequest,
  MonthlyEsgReport,
} from '@/lib/marketplace/corporateOffsetProgram';

export default function CorporateOffsetProgramPage(): JSX.Element {
  const [activeTab, setActiveTab] = useState<'enroll' | 'programs' | 'reports'>('programs');
  const [programs, setPrograms] = useState<CorporateProgramRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Enrollment Form State
  const [formData, setFormData] = useState<EnrollCorporateProgramRequest>({
    companyName: '',
    industry: 'Technology',
    contactEmail: '',
    corporateWalletAddress: 'GBTY4NZN2U4W7UUG6OXQ6K3YJ3KVRQZ2W5T4WJJL32OEVH2K2ZVRJ6QO',
    target: {
      annualTargetTonnes: 1200,
      monthlyTargetTonnes: 100,
      targetNetZeroYear: 2030,
      scopeCoverage: ['scope_1', 'scope_2', 'scope_3'],
    },
    rules: {
      frequency: 'monthly',
      strategy: 'fixed_tonnage',
      fixedTonnesPerRun: 100,
      monthlyBudgetCapUsd: 5000,
      maxPricePerTonUsd: 45,
      preferredTypologies: ['Reforestation', 'Sustainable Agriculture'],
      preferredStandards: ['Gold Standard', 'Verra (VCS)'],
      autoRetireOnPurchase: true,
      settlementRail: 'stellar_usdc',
    },
  });

  const [submitting, setSubmitting] = useState<boolean>(false);

  const fetchPrograms = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v2/marketplace/corporate-program');
      if (res.ok) {
        const data = await res.json();
        setPrograms(data.programs || []);
      }
    } catch (err) {
      console.error('Failed to load corporate programs', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchPrograms();
  }, []);

  const handleEnrollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.companyName || !formData.contactEmail) {
      setNotification({ type: 'error', text: 'Please fill in Company Name and Contact Email' });
      return;
    }

    try {
      setSubmitting(true);
      setNotification(null);
      const res = await fetch('/api/v2/marketplace/corporate-program', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to enroll');
      }

      setNotification({
        type: 'success',
        text: `🎉 Successfully enrolled ${data.program.companyName} into the Automated Corporate Offset Program!`,
      });
      await fetchPrograms();
      setActiveTab('programs');
    } catch (err: any) {
      setNotification({ type: 'error', text: err.message || 'Enrollment failed' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleTriggerRun = async (programId: string) => {
    try {
      setExecutingId(programId);
      setNotification(null);
      const res = await fetch(`/api/v2/marketplace/corporate-program/${programId}/execute`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Execution failed');
      }

      setNotification({
        type: 'success',
        text: `⚡ Automated purchase of ${data.execution.tonnesPurchased} tCO2e executed! Stellar Tx: ${data.execution.stellarTransactionHash.slice(0, 16)}...`,
      });
      await fetchPrograms();
    } catch (err: any) {
      setNotification({ type: 'error', text: err.message || 'Failed to execute run' });
    } finally {
      setExecutingId(null);
    }
  };

  // Compile all monthly reports across programs for the reporting tab
  const allReports: { report: MonthlyEsgReport; programName: string }[] = [];
  programs.forEach((prog) => {
    prog.monthlyReports.forEach((rep) => {
      allReports.push({ report: rep, programName: prog.companyName });
    });
  });

  return (
    <main className="min-h-screen bg-background text-foreground py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link href="/marketplace" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              &larr; Marketplace
            </Link>
            <span className="text-muted-foreground">•</span>
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-xs">
              Corporate Program v2
            </Badge>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-foreground">
            Corporate Offset Program & Automated Enrollment
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-3xl">
            Set verified carbon offset targets, establish automated purchasing rules on the Stellar network, and
            receive audit-ready monthly ESG documentation with cryptographic retirement proofs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/projects/map">
            <Button variant="outline" size="sm" className="cursor-pointer">
              🗺 Offset Map
            </Button>
          </Link>
          <Button
            size="sm"
            onClick={() => setActiveTab('enroll')}
            className="cursor-pointer"
          >
            + Enroll Company
          </Button>
        </div>
      </div>

      {/* Global Notification Banner */}
      {notification && (
        <div
          className={`mb-6 p-4 rounded-xl border text-sm flex items-center justify-between ${
            notification.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
              : 'bg-destructive/10 border-destructive/30 text-destructive'
          }`}
        >
          <span>{notification.text}</span>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-xs font-bold px-2 py-0.5 rounded hover:bg-black/10 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Program Level Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card className="bg-card/70 backdrop-blur border-border/80">
          <CardContent className="p-5">
            <Text variant="muted" as="p" className="text-xs uppercase tracking-wider font-semibold">
              Enrolled Companies
            </Text>
            <div className="text-2xl font-bold mt-1 text-foreground">{programs.length}</div>
            <div className="text-xs text-muted-foreground mt-1">100% active auto-enrollment</div>
          </CardContent>
        </Card>

        <Card className="bg-card/70 backdrop-blur border-border/80">
          <CardContent className="p-5">
            <Text variant="muted" as="p" className="text-xs uppercase tracking-wider font-semibold">
              Total Tonnes Offset
            </Text>
            <div className="text-2xl font-bold mt-1 text-emerald-600">
              {programs.reduce((sum, p) => sum + p.cumulativeTonnesOffset, 0).toLocaleString()} <span className="text-xs font-normal text-muted-foreground">tCO2e</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">Retired on Stellar ledger</div>
          </CardContent>
        </Card>

        <Card className="bg-card/70 backdrop-blur border-border/80">
          <CardContent className="p-5">
            <Text variant="muted" as="p" className="text-xs uppercase tracking-wider font-semibold">
              Cumulative Capital Deployed
            </Text>
            <div className="text-2xl font-bold mt-1 text-primary">
              ${programs.reduce((sum, p) => sum + p.cumulativeSpendUsd, 0).toLocaleString()} <span className="text-xs font-normal text-muted-foreground">USDC</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">Direct to verified projects</div>
          </CardContent>
        </Card>

        <Card className="bg-card/70 backdrop-blur border-border/80">
          <CardContent className="p-5">
            <Text variant="muted" as="p" className="text-xs uppercase tracking-wider font-semibold">
              Monthly Audit Reports
            </Text>
            <div className="text-2xl font-bold mt-1 text-foreground">{allReports.length}</div>
            <div className="text-xs text-muted-foreground mt-1">Cryptographically certified</div>
          </CardContent>
        </Card>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-border mb-6">
        <button
          type="button"
          onClick={() => setActiveTab('programs')}
          className={`py-3 px-5 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === 'programs'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Active Corporate Programs ({programs.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('enroll')}
          className={`py-3 px-5 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === 'enroll'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          + Target Setting & Automated Enrollment
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('reports')}
          className={`py-3 px-5 text-sm font-semibold border-b-2 transition-all cursor-pointer ${
            activeTab === 'reports'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Monthly ESG Documentation ({allReports.length})
        </button>
      </div>

      {/* Tab 1: Active Programs Dashboard */}
      {activeTab === 'programs' && (
        <div className="space-y-6">
          {loading ? (
            <div className="py-12 text-center text-muted-foreground animate-pulse">
              Loading corporate offset enrollments...
            </div>
          ) : programs.length === 0 ? (
            <Card className="p-12 text-center">
              <span className="text-4xl block mb-2">🏢</span>
              <h3 className="text-lg font-bold mb-1">No Corporate Programs Enrolled Yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Be the first enterprise to configure an automated net-zero carbon offset pipeline.
              </p>
              <Button onClick={() => setActiveTab('enroll')}>Start Enrollment Wizard &rarr;</Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {programs.map((program) => {
                const percentAnnual = Math.min(
                  100,
                  Math.round((program.cumulativeTonnesOffset / program.target.annualTargetTonnes) * 100)
                );

                return (
                  <Card key={program.id} className="border-border/80 shadow-sm overflow-hidden">
                    <CardHeader className="bg-muted/30 border-b border-border/50 py-4 px-6 flex flex-col md:flex-row md:items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-xl font-bold text-foreground">
                            {program.companyName}
                          </CardTitle>
                          <Badge variant="outline" className="text-xs">
                            {program.industry}
                          </Badge>
                          <Badge
                            variant={program.status === 'active' ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            ● {program.status.toUpperCase()}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Target Net-Zero by {program.target.targetNetZeroYear} • Wallet:{' '}
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                            {program.corporateWalletAddress.slice(0, 8)}...
                            {program.corporateWalletAddress.slice(-6)}
                          </code>
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={executingId === program.id}
                          onClick={() => handleTriggerRun(program.id)}
                          className="cursor-pointer"
                        >
                          {executingId === program.id ? (
                            <span className="flex items-center gap-1.5">
                              <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                              Settling on Stellar...
                            </span>
                          ) : (
                            '⚡ Run Monthly Purchase Now'
                          )}
                        </Button>
                      </div>
                    </CardHeader>

                    <CardContent className="p-6 space-y-6">
                      {/* Target Progress Bar */}
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="font-semibold text-foreground">
                            Annual Offset Progress ({program.cumulativeTonnesOffset.toLocaleString()} / {program.target.annualTargetTonnes.toLocaleString()} tCO2e)
                          </span>
                          <span className="font-bold text-primary">{percentAnnual}%</span>
                        </div>
                        <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                            style={{ width: `${percentAnnual}%` }}
                          />
                        </div>
                      </div>

                      {/* Configuration Badges */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-xl bg-muted/40 border border-border/60 text-xs">
                        <div>
                          <span className="text-muted-foreground block mb-0.5">Monthly Commitment:</span>
                          <span className="font-bold text-foreground text-sm">
                            {program.target.monthlyTargetTonnes} tCO2e / mo
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block mb-0.5">Purchasing Rule:</span>
                          <span className="font-bold text-foreground text-sm uppercase">
                            {program.rules.strategy.replace('_', ' ')}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block mb-0.5">Settlement Rail:</span>
                          <span className="font-bold text-foreground text-sm">
                            Stellar USDC (Instant)
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block mb-0.5">Next Scheduled Cycle:</span>
                          <span className="font-bold text-primary text-sm">
                            {new Date(program.nextScheduledRun).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      {/* Recent Executions History */}
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                          Automated Execution & Settlement Ledger
                        </h4>

                        {program.executionHistory.length === 0 ? (
                          <div className="text-xs text-muted-foreground italic p-3 bg-muted/20 rounded-lg">
                            No automated runs recorded yet. The first automated purchase will execute on schedule or click &quot;Run Monthly Purchase Now&quot; above.
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left">
                              <thead className="bg-muted/50 text-muted-foreground">
                                <tr>
                                  <th className="p-2">Period</th>
                                  <th className="p-2">Tonnes Offset</th>
                                  <th className="p-2">Amount (USDC)</th>
                                  <th className="p-2">Allocated Project</th>
                                  <th className="p-2">Stellar Tx Hash</th>
                                  <th className="p-2">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border/60">
                                {program.executionHistory.map((exec) => (
                                  <tr key={exec.id} className="hover:bg-muted/20">
                                    <td className="p-2 font-medium text-foreground">{exec.periodLabel}</td>
                                    <td className="p-2 font-semibold text-emerald-600">{exec.tonnesPurchased} tCO2e</td>
                                    <td className="p-2">${exec.totalSpendUsd.toLocaleString()}</td>
                                    <td className="p-2 text-muted-foreground">
                                      {exec.allocations[0]?.projectName || 'Verified Basket'}
                                    </td>
                                    <td className="p-2 font-mono text-[11px] text-primary">
                                      {exec.stellarTransactionHash.slice(0, 14)}...
                                    </td>
                                    <td className="p-2">
                                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 text-[10px]">
                                        ✓ Verified
                                      </Badge>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Target Setting & Automated Enrollment Wizard */}
      {activeTab === 'enroll' && (
        <Card className="max-w-4xl mx-auto border-border/80 shadow-md">
          <CardHeader className="border-b border-border/60 pb-4">
            <CardTitle className="text-xl font-bold">
              Enroll Company in Automated Carbon Offset Program
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Configure your corporate emission baseline, net-zero milestone targets, and automated settlement rules.
            </p>
          </CardHeader>

          <CardContent className="p-6">
            <form onSubmit={handleEnrollSubmit} className="space-y-6">
              {/* Section 1: Company Profile */}
              <div>
                <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs">
                    1
                  </span>
                  Corporate Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Company / Organization Name *
                    </label>
                    <Input
                      type="text"
                      required
                      placeholder="e.g. Meridian Global Logistics Inc."
                      value={formData.companyName}
                      onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Industry Sector
                    </label>
                    <select
                      value={formData.industry}
                      onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                      className="w-full bg-background border border-border text-xs rounded-lg px-3 py-2 text-foreground outline-none"
                    >
                      <option value="Technology">Technology & Cloud Computing</option>
                      <option value="Logistics">Transportation & Logistics</option>
                      <option value="Finance">Financial Services</option>
                      <option value="Manufacturing">Manufacturing & Consumer Goods</option>
                      <option value="Retail">Retail & E-commerce</option>
                      <option value="Energy">Energy & Utilities</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Sustainability Contact Email *
                    </label>
                    <Input
                      type="email"
                      required
                      placeholder="esg@company.com"
                      value={formData.contactEmail}
                      onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Corporate Stellar Public Key (for on-chain retirement)
                    </label>
                    <Input
                      type="text"
                      placeholder="G... (Stellar public key)"
                      value={formData.corporateWalletAddress}
                      onChange={(e) => setFormData({ ...formData, corporateWalletAddress: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Target Goals */}
              <div className="pt-4 border-t border-border/60">
                <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs">
                    2
                  </span>
                  Net-Zero Targets & Scope Goals
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Monthly Offset Goal (tCO2e) *
                    </label>
                    <Input
                      type="number"
                      min="1"
                      required
                      value={formData.target.monthlyTargetTonnes}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10) || 10;
                        setFormData({
                          ...formData,
                          target: {
                            ...formData.target,
                            monthlyTargetTonnes: val,
                            annualTargetTonnes: val * 12,
                          },
                          rules: {
                            ...formData.rules,
                            fixedTonnesPerRun: val,
                          },
                        });
                      }}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Annual Target (tCO2e)
                    </label>
                    <Input
                      type="number"
                      min="1"
                      value={formData.target.annualTargetTonnes}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          target: {
                            ...formData.target,
                            annualTargetTonnes: parseInt(e.target.value, 10) || 120,
                          },
                        })
                      }
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Target Net-Zero Year
                    </label>
                    <Input
                      type="number"
                      min="2026"
                      max="2050"
                      value={formData.target.targetNetZeroYear}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          target: {
                            ...formData.target,
                            targetNetZeroYear: parseInt(e.target.value, 10) || 2030,
                          },
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Section 3: Automated Purchasing Rules */}
              <div className="pt-4 border-t border-border/60">
                <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs">
                    3
                  </span>
                  Automated Execution Strategy & Preferences
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Purchasing Strategy
                    </label>
                    <select
                      value={formData.rules.strategy}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          rules: {
                            ...formData.rules,
                            strategy: e.target.value as any,
                          },
                        })
                      }
                      className="w-full bg-background border border-border text-xs rounded-lg px-3 py-2 text-foreground outline-none"
                    >
                      <option value="fixed_tonnage">Fixed Monthly Tonnage</option>
                      <option value="budget_capped">Budget Capped (Max $ / month)</option>
                      <option value="dynamic_footprint">Dynamic Monthly Footprint</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Monthly Budget Cap (USD / USDC)
                    </label>
                    <Input
                      type="number"
                      value={formData.rules.monthlyBudgetCapUsd || 5000}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          rules: {
                            ...formData.rules,
                            monthlyBudgetCapUsd: parseInt(e.target.value, 10) || 5000,
                          },
                        })
                      }
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">
                      Max Price per Ton ($ / tCO2e)
                    </label>
                    <Input
                      type="number"
                      value={formData.rules.maxPricePerTonUsd}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          rules: {
                            ...formData.rules,
                            maxPricePerTonUsd: parseInt(e.target.value, 10) || 50,
                          },
                        })
                      }
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl border border-border/60">
                  <input
                    type="checkbox"
                    id="autoRetire"
                    checked={formData.rules.autoRetireOnPurchase}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        rules: {
                          ...formData.rules,
                          autoRetireOnPurchase: e.target.checked,
                        },
                      })
                    }
                    className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
                  />
                  <label htmlFor="autoRetire" className="text-xs text-foreground cursor-pointer">
                    <strong>Auto-Retire on Purchase:</strong> Immediately retire purchased credits on the Stellar
                    blockchain to create permanent, tamper-proof retirement receipts and avoid double counting.
                  </label>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-4 border-t border-border/60 flex items-center justify-end gap-3">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setActiveTab('programs')}
                  className="cursor-pointer"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="cursor-pointer bg-primary text-primary-foreground font-semibold"
                >
                  {submitting ? 'Enrolling Company...' : 'Activate Automated Program &rarr;'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Tab 3: Monthly ESG Documentation & Reporting */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          <div className="bg-card border border-border/80 rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-foreground mb-1">
              Monthly Audit Documentation & Compliance Packages
            </h2>
            <p className="text-xs text-muted-foreground mb-4">
              Download audited monthly offset statements, verified project allocation certificates, and Stellar
              cryptographic digests suitable for CSRD, SEC ESG, and GHG Protocol Scope 1-3 filings.
            </p>

            {allReports.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-xs italic">
                No monthly reports generated yet. Reports are produced automatically upon each completed offset run.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {allReports.map(({ report, programName }) => (
                  <Card key={report.reportId} className="border-border/70 bg-muted/10">
                    <CardHeader className="py-3 px-4 border-b border-border/50 flex flex-row items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-foreground">{programName}</span>
                        <span className="text-[11px] text-muted-foreground block">
                          Reporting Period: {report.monthYear}
                        </span>
                      </div>
                      <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary">
                        Report #{report.reportId.slice(-6)}
                      </Badge>
                    </CardHeader>

                    <CardContent className="p-4 space-y-3 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Tonnes Retired:</span>
                        <span className="font-bold text-emerald-600">
                          {report.actualTonnesOffset} tCO2e ({report.percentOfMonthlyGoal}% of goal)
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Spend:</span>
                        <span className="font-semibold text-foreground">${report.totalSpendUsd.toLocaleString()} USDC</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Supported Project:</span>
                        <span className="font-medium text-foreground">
                          {report.supportedProjects[0]?.projectName || 'Global Portfolio'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Stellar Sequence:</span>
                        <span className="font-mono text-primary">#{report.stellarLedgerSequence}</span>
                      </div>

                      {/* SDG Impact Badges */}
                      <div className="pt-2 border-t border-border/50">
                        <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-1">
                          SDG Alignment:
                        </span>
                        <div className="space-y-1">
                          {report.sdgImpactMetrics.map((sdg) => (
                            <div key={sdg.sdg} className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                              <span className="px-1 py-0.2 bg-primary/10 text-primary rounded font-bold text-[10px]">
                                SDG {sdg.sdg}
                              </span>
                              <span>{sdg.impactSummary}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="pt-2 flex items-center justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            // Download report as JSON audit file
                            const blob = new Blob([JSON.stringify(report, null, 2)], {
                              type: 'application/json',
                            });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `esg-report-${report.companyName.toLowerCase().replace(/\s+/g, '-')}-${report.monthYear}.json`;
                            a.click();
                          }}
                          className="text-xs h-7 cursor-pointer"
                        >
                          📥 Download Audit Package (JSON)
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
