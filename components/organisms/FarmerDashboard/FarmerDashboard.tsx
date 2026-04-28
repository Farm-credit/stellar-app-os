'use client';

import { useFarmerDashboard } from '@/hooks/useFarmerDashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/molecules/Card';
import { Badge } from '@/components/atoms/Badge';
import { Text } from '@/components/atoms/Text';
import { Skeleton } from '@/components/atoms/Skeleton';
import {
  Coins,
  Clock,
  TreePine,
  TrendingUp,
  CalendarDays,
  CheckCircle2,
  Lock,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import type { MilestonePayment, PlantingRecord, NextAssignment } from '@/types/farmer-dashboard';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-US').format(n);
}
function fmtUsdc(n: number) {
  return `$${fmt(n)} USDC`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// ── Milestone badge ───────────────────────────────────────────────────────────

function MilestoneBadge({ m }: { m: MilestonePayment }) {
  const label = `${m.percentage}% — ${fmtUsdc(m.amountUsdc)}`;
  if (m.status === 'paid')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-stellar-green/10 px-2.5 py-0.5 text-xs font-semibold text-stellar-green">
        <CheckCircle2 className="h-3 w-3" /> {label}
        {m.txHash && (
          <a
            href={`https://stellar.expert/explorer/testnet/tx/${m.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View transaction"
          >
            <ExternalLink className="h-3 w-3 opacity-60 hover:opacity-100" />
          </a>
        )}
      </span>
    );
  if (m.status === 'pending')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-600">
        <Clock className="h-3 w-3" /> {label} · due {fmtDate(m.date)}
      </span>
    );
  // locked
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
      <Lock className="h-3 w-3" /> {label} · unlocks {fmtDate(m.date)}
    </span>
  );
}

// ── Planting status badge ─────────────────────────────────────────────────────

function PlantingBadge({ status }: { status: PlantingRecord['status'] }) {
  const map = {
    verified: { variant: 'success' as const, label: 'Verified' },
    completed: { variant: 'default' as const, label: 'Completed' },
    pending: { variant: 'secondary' as const, label: 'Pending' },
    failed: { variant: 'destructive' as const, label: 'Failed' },
  };
  const { variant, label } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}

// ── Survival rate bar ─────────────────────────────────────────────────────────

function SurvivalBar({ rate }: { rate: number | null }) {
  if (rate === null) return <Text className="text-muted-foreground">Not yet measured</Text>;
  const color = rate >= 80 ? 'bg-stellar-green' : rate >= 60 ? 'bg-amber-500' : 'bg-destructive';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${rate}%` }} />
      </div>
      <Text>{rate}%</Text>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent?: string;
}) {
  return (
    <Card className="relative overflow-hidden border-none shadow-sm rounded-3xl bg-card/60 backdrop-blur-sm">
      <div className={`absolute top-0 left-0 w-full h-1 ${accent ?? 'bg-stellar-blue/30'}`} />
      <CardContent className="p-6 flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-stellar-blue/10 text-stellar-blue">
          {icon}
        </div>
        <div>
          <Text className="uppercase tracking-widest text-muted-foreground font-bold">{label}</Text>
          <Text className="leading-tight">{value}</Text>
          {sub && <Text className="text-muted-foreground">{sub}</Text>}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function FarmerDashboard({ farmerId }: { farmerId?: string }) {
  const { data, isLoading, error, retry } = useFarmerDashboard(farmerId);

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <Text>Failed to load dashboard</Text>
        <Text className="text-muted-foreground">{error}</Text>
        <button
          onClick={retry}
          className="rounded-full bg-stellar-blue px-6 py-2 text-sm font-semibold text-white hover:bg-stellar-blue/90"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        {isLoading ? (
          <Skeleton className="h-8 w-48" />
        ) : (
          <Text as="h1">Welcome, {data?.farmerName}</Text>
        )}
        <Text className="text-muted-foreground mt-1">
          Your planting activity and payment overview
        </Text>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="rounded-3xl border-none shadow-sm">
              <CardContent className="p-6 space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-7 w-32" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <StatCard
              label="Total Earned"
              value={fmtUsdc(data?.earnings.totalPaidUsdc ?? 0)}
              sub="All milestones paid"
              icon={<Coins className="h-5 w-5" />}
              accent="bg-stellar-green"
            />
            <StatCard
              label="Pending Payments"
              value={fmtUsdc(data?.earnings.pendingUsdc ?? 0)}
              sub="Awaiting release"
              icon={<Clock className="h-5 w-5" />}
              accent="bg-amber-400"
            />
            <StatCard
              label="Trees Planted"
              value={fmt(data?.plantingHistory.reduce((s, r) => s + r.treesPlanted, 0) ?? 0)}
              sub={`${data?.plantingHistory.length ?? 0} projects`}
              icon={<TreePine className="h-5 w-5" />}
              accent="bg-stellar-blue/50"
            />
            <StatCard
              label="Survival Rate"
              value={`${data?.overallSurvivalRate ?? 0}%`}
              sub="Across verified plots"
              icon={<TrendingUp className="h-5 w-5" />}
              accent={(data?.overallSurvivalRate ?? 0) >= 80 ? 'bg-stellar-green' : 'bg-amber-400'}
            />
          </>
        )}
      </div>

      {/* ── Planting history ── */}
      <Card className="border-none shadow-sm rounded-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TreePine className="h-4 w-4 text-stellar-green" />
            Planting History
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-px">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="px-6 py-4 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-64" />
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y">
              {(data?.plantingHistory ?? []).map((rec) => (
                <div key={rec.id} className="px-6 py-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <Text>{rec.projectName}</Text>
                      <Text className="text-muted-foreground">
                        {rec.location} · {fmt(rec.treesPlanted)} trees · {fmtDate(rec.plantedAt)}
                      </Text>
                    </div>
                    <div className="flex items-center gap-2">
                      <PlantingBadge status={rec.status} />
                      <SurvivalBar rate={rec.survivalRate} />
                    </div>
                  </div>
                  {/* Milestone payments */}
                  <div className="flex flex-wrap gap-2">
                    {rec.milestones.map((m) => (
                      <MilestoneBadge key={m.type} m={m} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Next assignments ── */}
      <Card className="border-none shadow-sm rounded-3xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4 text-stellar-blue" />
            Next Planting Assignments
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-px">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="px-6 py-4 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-64" />
                </div>
              ))}
            </div>
          ) : (data?.nextAssignments.length ?? 0) === 0 ? (
            <div className="px-6 py-8 text-center">
              <Text className="text-muted-foreground">No upcoming assignments</Text>
            </div>
          ) : (
            <div className="divide-y">
              {(data?.nextAssignments ?? []).map((a: NextAssignment) => (
                <div
                  key={a.id}
                  className="px-6 py-4 flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <Text>{a.projectName}</Text>
                    <Text className="text-muted-foreground">
                      {a.location} · {fmt(a.treesTarget)} trees · {fmtDate(a.scheduledDate)}
                    </Text>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={a.status === 'in_progress' ? 'default' : 'secondary'}>
                      {a.status === 'in_progress' ? 'In Progress' : 'Upcoming'}
                    </Badge>
                    <span className="text-xs font-semibold text-stellar-green">
                      Est. {fmtUsdc(a.estimatedEarningUsdc)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

FarmerDashboard.displayName = 'FarmerDashboard';
