'use client';

import React, { useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Leaf,
  DollarSign,
  Globe2,
  TrendingUp,
  Download,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  AlertCircle,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/molecules/Card';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { cn } from '@/lib/utils';
import {
  mockPurchases,
  mockMonthlyTrends,
  computePortfolioSummary,
  computeProjectAllocations,
  computeCoBenefits,
  type OffsetPurchase,
} from '@/lib/api/mock/corporateBuyer';

// ─── Design tokens ─────────────────────────────────────────────────────────────
const COLORS = {
  blue: '#14B6E7',
  purple: '#3E1BDB',
  cyan: '#00C2FF',
  green: '#00B36B',
  amber: '#F59E0B',
  rose: '#F43F5E',
  teal: '#14B8A6',
  indigo: '#6366F1',
};

const PIE_PALETTE = [
  COLORS.blue,
  COLORS.green,
  COLORS.purple,
  COLORS.cyan,
  COLORS.amber,
  COLORS.teal,
  COLORS.indigo,
  COLORS.rose,
];

// ─── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number, digits = 0) {
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function usd(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

type TrendMetric = 'tonsRetired' | 'spend' | 'avgPricePerTon';

const STATUS_ICON: Record<OffsetPurchase['status'], React.ReactNode> = {
  retired: <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />,
  active: <Clock className="h-3.5 w-3.5 text-stellar-blue" />,
  pending: <AlertCircle className="h-3.5 w-3.5 text-amber-400" />,
};

const STATUS_LABEL: Record<OffsetPurchase['status'], string> = {
  retired: 'Retired',
  active: 'Active',
  pending: 'Pending',
};

// ─── KPI card ──────────────────────────────────────────────────────────────────
interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  color: string;
}

function KpiCard({ label, value, sub, icon: Icon, color }: KpiCardProps) {
  return (
    <Card className="border-white/5 bg-stellar-navy/40 backdrop-blur-sm">
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-white/50">{label}</p>
            <p className="mt-1.5 text-2xl font-bold text-white truncate">{value}</p>
            {sub && <p className="mt-0.5 text-xs text-white/40">{sub}</p>}
          </div>
          <div className={cn('shrink-0 rounded-xl p-2.5 bg-white/5', color)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────
export function CorporateBuyerDashboard() {
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('tonsRetired');
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

  const summary = useMemo(() => computePortfolioSummary(mockPurchases), []);
  const allocations = useMemo(() => computeProjectAllocations(mockPurchases), []);
  const coBenefits = useMemo(() => computeCoBenefits(mockPurchases), []);

  // Pie data: tons by project type
  const typeBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of allocations) {
      map.set(a.projectType, (map.get(a.projectType) ?? 0) + a.tons);
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [allocations]);

  const trendLabel: Record<TrendMetric, string> = {
    tonsRetired: 'Tons Retired',
    spend: 'Spend (USD)',
    avgPricePerTon: 'Avg $/ton',
  };

  const trendColor: Record<TrendMetric, string> = {
    tonsRetired: COLORS.green,
    spend: COLORS.blue,
    avgPricePerTon: COLORS.amber,
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Text variant="h2" className="text-3xl font-bold tracking-tight text-white">
            Corporate Offset Dashboard
          </Text>
          <Text variant="muted" className="mt-1 text-base">
            Acme Corp · portfolio as of {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </Text>
        </div>
        <Button variant="outline" className="gap-2 border-white/10 hover:bg-white/5 self-start sm:self-auto">
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total Offset Purchased"
          value={`${fmt(summary.totalTons)} tCO₂e`}
          sub={`${fmt(summary.retiredTons)} tons retired`}
          icon={Leaf}
          color="text-stellar-green"
        />
        <KpiCard
          label="Total Spend"
          value={usd(summary.totalSpend)}
          sub={`across ${summary.projectCount} projects`}
          icon={DollarSign}
          color="text-stellar-blue"
        />
        <KpiCard
          label="Avg Cost per Ton"
          value={`$${fmt(summary.avgCostPerTon, 2)}`}
          sub="weighted average"
          icon={TrendingUp}
          color="text-stellar-cyan"
        />
        <KpiCard
          label="Countries Covered"
          value={String(new Set(mockPurchases.map((p) => p.country)).size)}
          sub={`${summary.projectCount} unique projects`}
          icon={Globe2}
          color="text-stellar-purple"
        />
      </div>

      {/* ── Trend Analysis + Type Breakdown ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

        {/* Trend chart – 2/3 width */}
        <Card className="lg:col-span-2 border-white/5 bg-stellar-navy/40">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base font-semibold text-white">
                <TrendingUp className="h-4 w-4 text-stellar-blue" />
                Trend Analysis
              </CardTitle>
              <div className="flex gap-1">
                {(['tonsRetired', 'spend', 'avgPricePerTon'] as TrendMetric[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setTrendMetric(m)}
                    className={cn(
                      'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                      trendMetric === m
                        ? 'bg-white/10 text-white'
                        : 'text-white/40 hover:text-white/70'
                    )}
                  >
                    {trendLabel[m]}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={mockMonthlyTrends} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={trendColor[trendMetric]} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={trendColor[trendMetric]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                  dataKey="month"
                  tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => (trendMetric === 'spend' ? `$${(v / 1000).toFixed(0)}k` : String(v))}
                  width={48}
                />
                <Tooltip
                  contentStyle={{
                    background: '#0D0B21',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: 'rgba(255,255,255,0.7)' }}
                  itemStyle={{ color: trendColor[trendMetric] }}
                  formatter={(v: number) =>
                    trendMetric === 'spend'
                      ? [usd(v), trendLabel[trendMetric]]
                      : trendMetric === 'avgPricePerTon'
                      ? [`$${v.toFixed(2)}`, trendLabel[trendMetric]]
                      : [`${fmt(v)} tCO₂e`, trendLabel[trendMetric]]
                  }
                />
                <Area
                  type="monotone"
                  dataKey={trendMetric}
                  stroke={trendColor[trendMetric]}
                  strokeWidth={2}
                  fill="url(#trendGradient)"
                  dot={false}
                  activeDot={{ r: 4, fill: trendColor[trendMetric] }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Project type pie – 1/3 width */}
        <Card className="border-white/5 bg-stellar-navy/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-white">Portfolio by Type</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4 pt-0">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={typeBreakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {typeBreakdown.map((_, i) => (
                    <Cell key={i} fill={PIE_PALETTE[i % PIE_PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: '#0D0B21',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [`${fmt(v)} tCO₂e`]}
                />
              </PieChart>
            </ResponsiveContainer>
            <ul className="w-full space-y-1.5">
              {typeBreakdown.map((t, i) => (
                <li key={t.name} className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5 text-white/70">
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ background: PIE_PALETTE[i % PIE_PALETTE.length] }}
                    />
                    {t.name}
                  </span>
                  <span className="font-medium text-white">{fmt(t.value)} t</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* ── Co-benefits + Cost per ton bar ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* Co-benefits panel */}
        <Card className="border-white/5 bg-stellar-navy/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-white">
              <ShieldCheck className="h-4 w-4 text-stellar-green" />
              Co-Benefits Coverage
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            {coBenefits.map((cb) => {
              const pct = Math.round((cb.tons / summary.totalTons) * 100);
              return (
                <div key={cb.label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-white/80">{cb.label}</span>
                    <span className="text-xs text-white/40">{fmt(cb.tons)} t · {pct}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-stellar-green transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Avg cost per ton by project */}
        <Card className="border-white/5 bg-stellar-navy/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold text-white">
              <DollarSign className="h-4 w-4 text-stellar-blue" />
              Avg Cost per Ton by Project
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={allocations}
                layout="vertical"
                margin={{ top: 0, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `$${v}`}
                />
                <YAxis
                  type="category"
                  dataKey="projectName"
                  width={130}
                  tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: string) => (v.length > 20 ? v.slice(0, 18) + '…' : v)}
                />
                <Tooltip
                  contentStyle={{
                    background: '#0D0B21',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  formatter={(v: number) => [`$${v.toFixed(2)} / tCO₂e`]}
                />
                <Bar dataKey="avgPricePerTon" radius={[0, 4, 4, 0]}>
                  {allocations.map((_, i) => (
                    <Cell key={i} fill={PIE_PALETTE[i % PIE_PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Supply chain / project breakdown ── */}
      <Card className="border-white/5 bg-stellar-navy/40">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-white">
            <Globe2 className="h-4 w-4 text-stellar-purple" />
            Project Supply Chain
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                {['Project', 'Type', 'Location', 'Standard', 'Vintage', 'Tons', 'Spend', '$/ton', 'Co-benefits'].map((h) => (
                  <th key={h} className="pb-2 pr-4 text-left text-xs font-medium uppercase tracking-wider text-white/40 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {allocations.map((a) => {
                const isOpen = expandedProject === a.projectId;
                const purchases = mockPurchases.filter((p) => p.projectId === a.projectId);
                return (
                  <React.Fragment key={a.projectId}>
                    <tr
                      className="cursor-pointer hover:bg-white/[0.03] transition-colors"
                      onClick={() => setExpandedProject(isOpen ? null : a.projectId)}
                    >
                      <td className="py-3 pr-4 font-medium text-white whitespace-nowrap">
                        <span className="flex items-center gap-1.5">
                          {isOpen ? (
                            <ChevronUp className="h-3.5 w-3.5 text-white/40" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-white/40" />
                          )}
                          {a.projectName}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-white/60 whitespace-nowrap">{a.projectType}</td>
                      <td className="py-3 pr-4 text-white/60 whitespace-nowrap">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {a.country}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-white/60 whitespace-nowrap">{a.verificationStandard}</td>
                      <td className="py-3 pr-4 text-white/60">{a.vintage}</td>
                      <td className="py-3 pr-4 font-medium text-white">{fmt(a.tons)}</td>
                      <td className="py-3 pr-4 text-white/80">{usd(a.spend)}</td>
                      <td className="py-3 pr-4 text-white/80">${a.avgPricePerTon.toFixed(2)}</td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap gap-1">
                          {a.coBenefits.map((cb) => (
                            <span
                              key={cb}
                              className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-white/60"
                            >
                              {cb}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>

                    {/* Expanded: individual purchases */}
                    {isOpen && (
                      <tr>
                        <td colSpan={9} className="pb-3 pt-0">
                          <div className="ml-5 rounded-lg border border-white/5 bg-black/20 overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-white/5">
                                  {['Date', 'Tons', 'Price/t', 'Total', 'Status'].map((h) => (
                                    <th key={h} className="px-4 py-2 text-left font-medium text-white/30 uppercase tracking-wider whitespace-nowrap">
                                      {h}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-white/5">
                                {purchases.map((p) => (
                                  <tr key={p.id} className="hover:bg-white/[0.02]">
                                    <td className="px-4 py-2 text-white/50">{new Date(p.date).toLocaleDateString('en-US')}</td>
                                    <td className="px-4 py-2 text-white/80">{fmt(p.tons)}</td>
                                    <td className="px-4 py-2 text-white/80">${p.pricePerTon.toFixed(2)}</td>
                                    <td className="px-4 py-2 text-white/80">{usd(p.totalCost)}</td>
                                    <td className="px-4 py-2">
                                      <span className="flex items-center gap-1">
                                        {STATUS_ICON[p.status]}
                                        <span className="text-white/60">{STATUS_LABEL[p.status]}</span>
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* ── Spend vs Tons dual-axis trend ── */}
      <Card className="border-white/5 bg-stellar-navy/40">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-white">
            <TrendingUp className="h-4 w-4 text-stellar-cyan" />
            Spend vs Tons Retired – Monthly
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={mockMonthlyTrends} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="month"
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="tons"
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}t`}
                width={40}
              />
              <YAxis
                yAxisId="spend"
                orientation="right"
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                width={48}
              />
              <Tooltip
                contentStyle={{
                  background: '#0D0B21',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number, name: string) =>
                  name === 'tonsRetired' ? [`${fmt(v)} tCO₂e`, 'Tons Retired'] : [usd(v), 'Spend']
                }
              />
              <Legend
                wrapperStyle={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}
                formatter={(v) => (v === 'tonsRetired' ? 'Tons Retired' : 'Spend')}
              />
              <Bar yAxisId="tons" dataKey="tonsRetired" fill={COLORS.green} radius={[3, 3, 0, 0]} opacity={0.85} />
              <Bar yAxisId="spend" dataKey="spend" fill={COLORS.blue} radius={[3, 3, 0, 0]} opacity={0.7} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

    </div>
  );
}
