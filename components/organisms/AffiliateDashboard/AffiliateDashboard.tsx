'use client';

import {
  Users,
  Coins,
  Wallet,
  Clock,
  BadgeCheck,
  TrendingUp,
  AlertCircle,
  Megaphone,
  Calendar,
  CheckCircle2,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/molecules/Card';
import { Badge } from '@/components/atoms/Badge';
import { Skeleton } from '@/components/atoms/Skeleton';
import { Text } from '@/components/atoms/Text';
import { Button } from '@/components/atoms/Button';
import { AffiliateLinkCard } from '@/components/molecules/AffiliateLinkCard';
import { CommissionTiers } from '@/components/organisms/CommissionTiers';
import SocialShareButtons from '@/components/SocialShareButtons';
import { useAffiliateProgram } from '@/hooks/useAffiliateProgram';
import { cn } from '@/lib/utils';
import type { AffiliateReferralStatus } from '@/lib/types/affiliate';

function fmtUsd(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function StatCard({
  icon,
  label,
  value,
  sub,
  accent = 'bg-stellar-blue/10 text-stellar-blue',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <Card className="rounded-2xl border-none bg-card/60 shadow-sm">
      <CardContent className="p-5">
        <div className={cn('mb-3 flex h-10 w-10 items-center justify-center rounded-xl', accent)}>
          {icon}
        </div>
        <Text variant="small" className="uppercase tracking-widest text-muted-foreground font-bold">
          {label}
        </Text>
        <Text className="text-xl font-bold leading-tight">{value}</Text>
        {sub && (
          <Text variant="small" className="text-muted-foreground">
            {sub}
          </Text>
        )}
      </CardContent>
    </Card>
  );
}

function ReferralStatusBadge({ status }: { status: AffiliateReferralStatus }) {
  const map: Record<
    AffiliateReferralStatus,
    { variant: 'success' | 'default' | 'secondary'; label: string }
  > = {
    paid: { variant: 'success', label: 'Paid out' },
    eligible: { variant: 'default', label: 'Eligible' },
    pending: { variant: 'secondary', label: 'Pending' },
  };
  const { variant, label } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export function AffiliateDashboard() {
  const { data, loading, error, retry } = useAffiliateProgram();

  if (error && loading === false) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-12 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <Text className="font-semibold">Failed to load the affiliate program</Text>
        <Text variant="muted">{error}</Text>
        <Button stellar="primary" onClick={retry}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-stellar-blue/10 bg-gradient-to-br from-stellar-navy to-stellar-blue/40 p-8 sm:p-12">
        <div className="relative z-10 max-w-2xl space-y-4">
          <Badge className="bg-white/10 text-white border-white/20">
            <Megaphone className="mr-1 h-3.5 w-3.5" aria-hidden /> Affiliate Program
          </Badge>
          <Text as="h1" variant="h2" className="font-black tracking-tight text-white">
            Earn 10–25% on every sponsor you refer
          </Text>
          <Text className="text-white/85">
            Share your unique link with your audience. When they become sponsors, you earn a
            recurring commission based on their contributions — paid directly to your wallet.
          </Text>
          <div className="flex flex-wrap gap-3 pt-1">
            <div className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white">
              <TrendingUp className="h-4 w-4" aria-hidden />
              {loading ? '…' : `${data?.stats.tier.commissionRate ?? 10}% current rate`}
            </div>
            <div className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white">
              <Wallet className="h-4 w-4" aria-hidden />
              {loading ? '…' : fmtUsd(data?.stats.pendingPayoutUsdc ?? 0)} pending payout
            </div>
          </div>
        </div>
      </div>

      {/* Link + share */}
      <Card className="rounded-2xl border-stellar-blue/10">
        <CardContent className="space-y-6 p-6">
          {loading ? (
            <Skeleton className="h-16 w-full rounded-xl" />
          ) : (
            <>
              <AffiliateLinkCard referralLink={data?.stats.referralLink ?? ''} />
              <SocialShareButtons
                url={data?.stats.referralLink}
                title="Join me on FarmCredit as a partner"
                description="Refer sponsors and earn 10–25% commission on their contributions."
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="rounded-2xl">
              <CardContent className="p-5">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <StatCard
              icon={<Users className="h-5 w-5" />}
              label="Sponsors referred"
              value={String(data?.stats.totalSponsorsReferred ?? 0)}
              accent="bg-stellar-green/10 text-stellar-green"
            />
            <StatCard
              icon={<Coins className="h-5 w-5" />}
              label="Contributions"
              value={fmtUsd(data?.stats.totalContributionsUsdc ?? 0)}
              accent="bg-stellar-blue/10 text-stellar-blue"
            />
            <StatCard
              icon={<BadgeCheck className="h-5 w-5" />}
              label="Total earned"
              value={fmtUsd(data?.stats.totalEarnedUsdc ?? 0)}
              accent="bg-stellar-purple/10 text-stellar-purple"
            />
            <StatCard
              icon={<Clock className="h-5 w-5" />}
              label="Pending payout"
              value={fmtUsd(data?.stats.pendingPayoutUsdc ?? 0)}
              accent="bg-amber-500/10 text-amber-600"
            />
            <StatCard
              icon={<Wallet className="h-5 w-5" />}
              label="Paid out"
              value={fmtUsd(data?.stats.paidOutUsdc ?? 0)}
              accent="bg-stellar-cyan/10 text-stellar-cyan"
            />
          </>
        )}
      </div>

      {/* Commission tiers */}
      <section>
        <div className="mb-5">
          <Text variant="h3" className="font-bold">
            Commission tiers
          </Text>
          <Text variant="muted" className="mt-1">
            The more sponsors you refer, the higher your rate climbs — up to 25%.
          </Text>
        </div>
        {loading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-64 w-full rounded-2xl" />
            ))}
          </div>
        ) : (
          <CommissionTiers tiers={data?.tiers ?? []} activeTierId={data?.stats.tier.id} />
        )}
      </section>

      {/* Referrals table */}
      <section>
        <Card className="rounded-2xl border-stellar-blue/10">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="h-4 w-4 text-stellar-blue" aria-hidden />
                Recent referred sponsors
              </CardTitle>
              <CardDescription>Your latest referrals and their status.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-2 p-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-6 py-3 font-semibold">Sponsor</th>
                      <th className="px-6 py-3 font-semibold">Joined</th>
                      <th className="px-6 py-3 font-semibold">Source</th>
                      <th className="px-6 py-3 text-right font-semibold">Contributed</th>
                      <th className="px-6 py-3 text-right font-semibold">You earned</th>
                      <th className="px-6 py-3 text-center font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(data?.referrals ?? []).map((ref) => (
                      <tr key={ref.id}>
                        <td className="px-6 py-3 font-medium">{ref.sponsorName}</td>
                        <td className="px-6 py-3 text-muted-foreground">
                          {new Date(ref.joinedAt).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="px-6 py-3 text-muted-foreground capitalize">{ref.source}</td>
                        <td className="px-6 py-3 text-right font-medium">
                          {fmtUsd(ref.contributedUsdc)}
                        </td>
                        <td className="px-6 py-3 text-right font-semibold text-stellar-green">
                          {fmtUsd(ref.earnedUsdc)}
                        </td>
                        <td className="px-6 py-3 text-center">
                          <ReferralStatusBadge status={ref.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data && data.stats.pendingPayoutUsdc <= 0 && (
                  <div className="flex items-center gap-2 px-6 py-4 text-sm text-stellar-green">
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                    All eligible earnings have been paid out. Nice work!
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
