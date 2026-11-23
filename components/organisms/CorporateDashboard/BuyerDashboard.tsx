'use client';

import React, { useState } from 'react';
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
} from 'recharts';
import {
  Leaf,
  DollarSign,
  Globe,
  TrendingUp,
  Download,
  ChevronRight,
  Droplets,
  Users,
  Bird,
  ShieldCheck,
  MapPin,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/molecules/Card';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type TrendRange = '3M' | '6M' | '1Y' | 'ALL';

interface Project {
  id: string;
  name: string;
  country: string;
  type: string;
  registry: string;
  tons: number;
  status: 'verified' | 'pending' | 'retired';
  vintage: string;
}

// ─── Static mock data ─────────────────────────────────────────────────────────

const TOTAL_TONS = 4_820;
const TOTAL_SPEND = 144_600;
const AVG_COST_PER_TON = TOTAL_SPEND / TOTAL_TONS;
const YOY_GROWTH = 23.4; // percent

const MONTHLY_PURCHASE_TREND: Record<TrendRange, { month: string; tons: number; spend: number }[]> =
  {
    '3M': [
      { month: 'Jan', tons: 320, spend: 9_600 },
      { month: 'Feb', tons: 410, spend: 12_300 },
      { month: 'Mar', tons: 490, spend: 14_700 },
    ],
    '6M': [
      { month: 'Oct', tons: 180, spend: 5_400 },
      { month: 'Nov', tons: 220, spend: 6_600 },
      { month: 'Dec', tons: 290, spend: 8_700 },
      { month: 'Jan', tons: 320, spend: 9_600 },
      { month: 'Feb', tons: 410, spend: 12_300 },
      { month: 'Mar', tons: 490, spend: 14_700 },
    ],
    '1Y': [
      { month: 'Apr', tons: 140, spend: 4_200 },
      { month: 'May', tons: 160, spend: 4_800 },
      { month: 'Jun', tons: 200, spend: 6_000 },
      { month: 'Jul', tons: 230, spend: 6_900 },
      { month: 'Aug', tons: 270, spend: 8_100 },
      { month: 'Sep', tons: 300, spend: 9_000 },
      { month: 'Oct', tons: 180, spend: 5_400 },
      { month: 'Nov', tons: 220, spend: 6_600 },
      { month: 'Dec', tons: 290, spend: 8_700 },
      { month: 'Jan', tons: 320, spend: 9_600 },
      { month: 'Feb', tons: 410, spend: 12_300 },
      { month: 'Mar', tons: 490, spend: 14_700 },
    ],
    ALL: [
      { month: 'Q1 24', tons: 400, spend: 12_000 },
      { month: 'Q2 24', tons: 530, spend: 15_900 },
      { month: 'Q3 24', tons: 700, spend: 21_000 },
      { month: 'Q4 24', tons: 790, spend: 23_700 },
      { month: 'Q1 25', tons: 900, spend: 27_000 },
      { month: 'Q2 25', tons: 1_020, spend: 30_600 },
      { month: 'Q3 25', tons: 480, spend: 14_400 },
    ],
  };

const COST_PER_TON_TREND: Record<TrendRange, { month: string; costPerTon: number }[]> = {
  '3M': [
    { month: 'Jan', costPerTon: 29.4 },
    { month: 'Feb', costPerTon: 30.1 },
    { month: 'Mar', costPerTon: 30.0 },
  ],
  '6M': [
    { month: 'Oct', costPerTon: 28.8 },
    { month: 'Nov', costPerTon: 29.0 },
    { month: 'Dec', costPerTon: 29.5 },
    { month: 'Jan', costPerTon: 29.4 },
    { month: 'Feb', costPerTon: 30.1 },
    { month: 'Mar', costPerTon: 30.0 },
  ],
  '1Y': [
    { month: 'Apr', costPerTon: 28.0 },
    { month: 'May', costPerTon: 28.3 },
    { month: 'Jun', costPerTon: 28.5 },
    { month: 'Jul', costPerTon: 28.8 },
    { month: 'Aug', costPerTon: 29.0 },
    { month: 'Sep', costPerTon: 29.2 },
    { month: 'Oct', costPerTon: 28.8 },
    { month: 'Nov', costPerTon: 29.0 },
    { month: 'Dec', costPerTon: 29.5 },
    { month: 'Jan', costPerTon: 29.4 },
    { month: 'Feb', costPerTon: 30.1 },
    { month: 'Mar', costPerTon: 30.0 },
  ],
  ALL: [
    { month: 'Q1 24', costPerTon: 25.0 },
    { month: 'Q2 24', costPerTon: 26.5 },
    { month: 'Q3 24', costPerTon: 27.8 },
    { month: 'Q4 24', costPerTon: 28.0 },
    { month: 'Q1 25', costPerTon: 29.4 },
    { month: 'Q2 25', costPerTon: 30.0 },
    { month: 'Q3 25', costPerTon: 30.0 },
  ],
};

const CO_BENEFITS = [
  {
    label: 'Biodiversity',
    icon: Bird,
    color: 'text-stellar-green',
    bg: 'bg-stellar-green/10',
    value: '14 species protected',
    detail: 'Habitat restoration across 3 ecosystems',
  },
  {
    label: 'Water Security',
    icon: Droplets,
    color: 'text-stellar-cyan',
    bg: 'bg-stellar-cyan/10',
    value: '2.4M litres preserved',
    detail: 'Watershed protection in 2 river basins',
  },
  {
    label: 'Community',
    icon: Users,
    color: 'text-stellar-blue',
    bg: 'bg-stellar-blue/10',
    value: '1,240 livelihoods',
    detail: 'Direct income to smallholder farmers',
  },
  {
    label: 'SDG Alignment',
    icon: ShieldCheck,
    color: 'text-stellar-purple',
    bg: 'bg-stellar-purple/10',
    value: 'SDGs 13, 15, 1, 6',
    detail: 'Climate, land, poverty, clean water',
  },
];

const PROJECTS: Project[] = [
  {
    id: 'P001',
    name: 'Amazon Rainforest Restoration',
    country: 'Brazil',
    type: 'REDD+',
    registry: 'Verra VCS',
    tons: 1_800,
    status: 'verified',
    vintage: '2024',
  },
  {
    id: 'P002',
    name: 'Kenya Mangrove Planting',
    country: 'Kenya',
    type: 'Blue Carbon',
    registry: 'Gold Standard',
    tons: 940,
    status: 'verified',
    vintage: '2024',
  },
  {
    id: 'P003',
    name: 'Indonesia Peatland Protection',
    country: 'Indonesia',
    type: 'REDD+',
    registry: 'Verra VCS',
    tons: 1_200,
    status: 'verified',
    vintage: '2023',
  },
  {
    id: 'P004',
    name: 'European Mixed Forest Growth',
    country: 'Germany',
    type: 'ARR',
    registry: 'Plan Vivo',
    tons: 630,
    status: 'verified',
    vintage: '2024',
  },
  {
    id: 'P005',
    name: 'West African Agroforestry',
    country: 'Ghana',
    type: 'ARR',
    registry: 'Gold Standard',
    tons: 250,
    status: 'pending',
    vintage: '2025',
  },
];

const PROJECT_TYPE_BREAKDOWN = [
  { type: 'REDD+', tons: 3_000 },
  { type: 'Blue Carbon', tons: 940 },
  { type: 'ARR', tons: 880 },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  color,
  bg,
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  trend?: { direction: 'up' | 'down'; pct: number };
}) {
  return (
    <Card className="border-white/5 bg-stellar-navy/40 backdrop-blur-sm">
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-white/50">{label}</p>
            <p className="mt-1 text-2xl font-bold text-white truncate">{value}</p>
            {sub && <p className="mt-0.5 text-xs text-white/40">{sub}</p>}
            {trend && (
              <span
                className={cn(
                  'mt-1 inline-flex items-center gap-0.5 text-xs font-medium',
                  trend.direction === 'up' ? 'text-stellar-green' : 'text-red-400'
                )}
              >
                {trend.direction === 'up' ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : (
                  <ArrowDownRight className="h-3 w-3" />
                )}
                {trend.pct}% YoY
              </span>
            )}
          </div>
          <div className={cn('shrink-0 rounded-full p-2.5', bg, color)}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RangeToggle({
  range,
  onChange,
}: {
  range: TrendRange;
  onChange: (r: TrendRange) => void;
}) {
  const options: TrendRange[] = ['3M', '6M', '1Y', 'ALL'];
  return (
    <div className="flex gap-1 rounded-lg bg-black/20 p-1">
      {options.map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            range === r
              ? 'bg-stellar-blue text-white'
              : 'text-white/50 hover:text-white/80'
          )}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

const STATUS_CONFIG: Record<
  Project['status'],
  { label: string; className: string; Icon: React.ElementType }
> = {
  verified: {
    label: 'Verified',
    className: 'text-stellar-green bg-stellar-green/10',
    Icon: CheckCircle2,
  },
  pending: {
    label: 'Pending',
    className: 'text-yellow-400 bg-yellow-400/10',
    Icon: Clock,
  },
  retired: {
    label: 'Retired',
    className: 'text-white/40 bg-white/5',
    Icon: CheckCircle2,
  },
};

// ─── Main component ───────────────────────────────────────────────────────────

export function BuyerDashboard() {
  const [trendRange, setTrendRange] = useState<TrendRange>('1Y');

  const purchaseTrend = MONTHLY_PURCHASE_TREND[trendRange];
  const costTrend = COST_PER_TON_TREND[trendRange];

  return (
    <div className="space-y-10 animate-in fade-in duration-700">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Text variant="h2" className="text-3xl font-bold tracking-tight text-white">
            Buyer Dashboard
          </Text>
          <Text variant="muted" className="mt-1 text-base">
            Carbon offset portfolio for Acme Corp · Q1 2025
          </Text>
        </div>
        <Button
          variant="outline"
          className="gap-2 border-white/10 hover:bg-white/5 self-start sm:self-auto"
        >
          <Download className="h-4 w-4" />
          Export report
        </Button>
      </div>

      {/* ── KPI row ── */}
      <section aria-label="Key metrics">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total offsets purchased"
            value={`${TOTAL_TONS.toLocaleString()} tCO₂e`}
            sub="across 5 projects"
            icon={Leaf}
            color="text-stellar-green"
            bg="bg-stellar-green/10"
            trend={{ direction: 'up', pct: YOY_GROWTH }}
          />
          <StatCard
            label="Total spend"
            value={`$${(TOTAL_SPEND / 1000).toFixed(1)}k`}
            sub="YTD 2025"
            icon={DollarSign}
            color="text-stellar-blue"
            bg="bg-stellar-blue/10"
          />
          <StatCard
            label="Avg. cost per ton"
            value={`$${AVG_COST_PER_TON.toFixed(2)}`}
            sub="Market avg. $31.50"
            icon={TrendingUp}
            color="text-stellar-cyan"
            bg="bg-stellar-cyan/10"
            trend={{ direction: 'down', pct: 4.8 }}
          />
          <StatCard
            label="Countries of origin"
            value="4 countries"
            sub="Brazil · Kenya · Indonesia · Germany"
            icon={Globe}
            color="text-stellar-purple"
            bg="bg-stellar-purple/10"
          />
        </div>
      </section>

      {/* ── Trend analysis ── */}
      <section aria-label="Trend analysis">
        <div className="mb-4 flex items-center justify-between gap-4">
          <Text variant="h3" className="text-lg font-semibold text-white">
            Trend analysis
          </Text>
          <RangeToggle range={trendRange} onChange={setTrendRange} />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Purchase volume */}
          <Card className="border-white/5 bg-stellar-navy/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-white/70">
                Offset volume (tCO₂e)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={purchaseTrend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="volumeGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00b36b" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#00b36b" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.08} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#ffffff60' }} />
                    <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#ffffff60' }} width={36} />
                    <Tooltip
                      contentStyle={{ background: '#0d0b21', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}
                      labelStyle={{ color: '#ffffff80' }}
                      itemStyle={{ color: '#00b36b' }}
                      formatter={(v: number) => [`${v.toLocaleString()} tCO₂e`, 'Tons']}
                    />
                    <Area type="monotone" dataKey="tons" stroke="#00b36b" fill="url(#volumeGrad)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Cost per ton trend */}
          <Card className="border-white/5 bg-stellar-navy/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-white/70">
                Cost per tCO₂e (USD)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={costTrend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.08} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#ffffff60' }} />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: '#ffffff60' }}
                      width={36}
                      domain={['auto', 'auto']}
                      tickFormatter={(v: number) => `$${v}`}
                    />
                    <Tooltip
                      contentStyle={{ background: '#0d0b21', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}
                      labelStyle={{ color: '#ffffff80' }}
                      itemStyle={{ color: '#14b6e7' }}
                      formatter={(v: number) => [`$${v.toFixed(2)}`, 'Cost/ton']}
                    />
                    <Line type="monotone" dataKey="costPerTon" stroke="#14b6e7" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── Co-benefits ── */}
      <section aria-label="Co-benefits">
        <Text variant="h3" className="mb-4 text-lg font-semibold text-white">
          Co-benefits
        </Text>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CO_BENEFITS.map(({ label, icon: Icon, color, bg, value, detail }) => (
            <Card key={label} className="border-white/5 bg-stellar-navy/40">
              <CardContent className="p-5">
                <div className={cn('mb-3 inline-flex rounded-lg p-2', bg, color)}>
                  <Icon className="h-5 w-5" />
                </div>
                <p className="text-xs font-medium uppercase tracking-wide text-white/50">{label}</p>
                <p className="mt-1 text-sm font-semibold text-white">{value}</p>
                <p className="mt-0.5 text-xs text-white/40">{detail}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ── Supply chain of projects ── */}
      <section aria-label="Project supply chain">
        <div className="mb-4 flex items-center justify-between gap-4">
          <Text variant="h3" className="text-lg font-semibold text-white">
            Project supply chain
          </Text>
          {/* type breakdown bar chart */}
          <div className="hidden lg:block w-72 h-10">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={PROJECT_TYPE_BREAKDOWN} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="type" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#ffffff60' }} width={60} />
                <Tooltip
                  contentStyle={{ background: '#0d0b21', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}
                  itemStyle={{ color: '#14b6e7' }}
                  formatter={(v: number) => [`${v.toLocaleString()} tCO₂e`]}
                />
                <Bar dataKey="tons" fill="#14b6e7" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <Card className="border-white/5 bg-stellar-navy/40 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Projects table">
              <thead>
                <tr className="border-b border-white/5">
                  {['Project', 'Country', 'Type', 'Registry', 'Vintage', 'Offset (tCO₂e)', 'Status'].map(
                    (h) => (
                      <th
                        key={h}
                        scope="col"
                        className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-white/40"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {PROJECTS.map((p) => {
                  const { label, className, Icon } = STATUS_CONFIG[p.status];
                  return (
                    <tr key={p.id} className="group hover:bg-white/[0.03] transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 shrink-0 text-white/20" />
                          <span className="font-medium text-white">{p.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-white/60">{p.country}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-white/5 px-2 py-0.5 text-xs text-white/70">
                          {p.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white/60">{p.registry}</td>
                      <td className="px-4 py-3 text-white/60">{p.vintage}</td>
                      <td className="px-4 py-3 font-medium text-white">
                        {p.tons.toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                            className
                          )}
                        >
                          <Icon className="h-3 w-3" />
                          {label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-white/5 px-4 py-3">
            <button className="inline-flex items-center gap-1 text-xs text-stellar-blue hover:underline">
              View all projects
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </Card>
      </section>
    </div>
  );
}
