'use client';

import { useCallback, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { useUserDashboard } from '@/hooks/useUserDashboard';
import { StatCard, StatCardSkeleton } from './StatCard';
import { RecentActivity, RecentActivitySkeleton } from './RecentActivity';
import { QuickActions } from './QuickActions';
import { AnalyticsWidget, type ChartDataPoint } from '@/components/AnalyticsWidget';
import { Text } from '@/components/atoms/Text';
import { Button } from '@/components/atoms/Button';
import { Heart, Coins, Wind, Zap, Download } from 'lucide-react';
import { generateCertificatePdf } from '@/lib/certificate';

import { PlatformImpact } from './PlatformImpact';

export function DashboardOverview() {
  const { data, isLoading, error, retry } = useUserDashboard();

  /**
   * Generate mock analytics data for the last 30 days
   */
  const [certificateDownloadError, setCertificateDownloadError] = useState<string | null>(null);
  const [isCertificateGenerating, setIsCertificateGenerating] = useState(false);

  const analyticsData = useMemo((): ChartDataPoint[] => {
    const totalOffsetTonnes = (data?.stats.totalCO2OffsetKg ?? 8500) / 1000;
    const days: ChartDataPoint[] = [];
    for (let index = 0; index < 30; index++) {
      const date = new Date();
      date.setDate(date.getDate() - (29 - index));
      const dayName = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const offsetValue = Number(((totalOffsetTonnes / 29) * index).toFixed(2));

      days.push({
        name: dayName,
        co2Offset: offsetValue,
        donations: Math.floor(Math.random() * 500) + 100,
        carbonCredits: Number((Math.sin(index / 4) * 5 + 20).toFixed(0)),
        transactions: Math.floor(Math.random() * 100) + 20,
      });
    }
    return days;
  }, [data?.stats.totalCO2OffsetKg]);

  const handleCertificateDownload = useCallback(async () => {
    setCertificateDownloadError(null);
    setIsCertificateGenerating(true);

    try {
      const qrUrl = await QRCode.toDataURL('https://stellar.expert');
      generateCertificatePdf({
        qrDataUrl: qrUrl,
        data: {
          userName: 'Your Name',
          walletAddress: 'G...EXAMPLE',
          quantityRetired: 0,
          treeCount: data?.stats.totalDonationsTrees ?? 0,
          co2Offset: Number(((data?.stats.totalCO2OffsetKg ?? 0) / 1000).toFixed(2)),
          plantingDate: new Date(),
          region: 'Global Reforestation',
          projectName: 'Cumulative Carbon Offset',
          projectDescription: 'Cumulative progress across your impact journey.',
          transactionHash: 'N/A',
          retirementDate: new Date(),
          isAnonymous: false,
        },
      });
    } catch (error) {
      console.error(error);
      setCertificateDownloadError('Failed to generate carbon certificate. Please try again.');
    } finally {
      setIsCertificateGenerating(false);
    }
  }, [data?.stats.totalCO2OffsetKg, data?.stats.totalDonationsTrees]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-background min-h-[400px]">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/20 text-red-600 mb-6 font-bold shadow-sm">
          !
        </div>
        <Text variant="h3" className="mb-2 text-red-600 font-bold">
          Failed to load dashboard
        </Text>
        <Text variant="muted" className="mb-6 max-w-sm mx-auto font-medium">
          {error}
        </Text>
        <button
          onClick={retry}
          className="rounded-full bg-stellar-blue px-8 py-3 font-semibold text-white transition hover:bg-stellar-blue/90 shadow-lg shadow-stellar-blue/20"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <section>
        <PlatformImpact />
      </section>

      <section className="space-y-8">
        <div className="flex flex-col space-y-2 border-t pt-8">
          <Text variant="h2" className="text-3xl font-black tracking-tight">
            Your Activity
          </Text>
          <Text variant="muted" className="text-lg font-medium opacity-70">
            Personal environmental contribution and assets.
          </Text>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {isLoading ? (
            <>
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
              <StatCardSkeleton />
            </>
          ) : (
            <>
              <StatCard
                label="Total Donations"
                value={`$${data?.stats.totalDonationsAmount.toLocaleString()}`}
                subValue={`+${data?.stats.totalDonationsTrees} Trees planted`}
                positive
                icon={<Heart size={24} />}
              />
              <StatCard
                label="Carbon Credits"
                value={`${data?.stats.totalCarbonCreditsOwned.toLocaleString()} T`}
                subValue="Currently Owned"
                icon={<Coins size={24} />}
              />
              <StatCard
                label="CO2 Offset"
                value={`${((data?.stats.totalCO2OffsetKg || 0) / 1000).toLocaleString()} T`}
                subValue="Climate impact"
                positive
                icon={<Wind size={24} />}
              />
              <StatCard
                label="Active Projects"
                value="5"
                subValue="Supporting now"
                icon={<Zap size={24} />}
              />
            </>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-10 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {isLoading ? (
            <RecentActivitySkeleton />
          ) : (
            <RecentActivity activities={data?.recentActivity} />
          )}
        </div>
        <div className="lg:col-span-1">
          <QuickActions />
        </div>
      </section>

      {/* Analytics Section */}
      <section className="space-y-8">
        <div className="flex flex-col space-y-2">
          <Text variant="h2" className="text-2xl font-bold tracking-tight">
            Activity Analytics
          </Text>
          <Text variant="muted" className="text-sm font-medium opacity-70">
            Your 30-day activity trends and metrics
          </Text>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <AnalyticsWidget
            chartType="line"
            title="Donations Over Time"
            data={analyticsData}
            dataKeys={['donations']}
            colors={['#3b82f6']}
            showDateRange
            showExport
            showLegend
            height={300}
          />
          <AnalyticsWidget
            chartType="bar"
            title="Carbon Credits & Transactions"
            data={analyticsData}
            dataKeys={['carbonCredits', 'transactions']}
            colors={['#10b981', '#f59e0b']}
            showDateRange
            showExport
            showLegend
            height={300}
          />
        </div>
      </section>

      <section className="space-y-8">
        <div className="flex flex-col space-y-2">
          <Text variant="h2" className="text-2xl font-bold tracking-tight">
            Carbon Offset Growth
          </Text>
          <Text variant="muted" className="text-sm font-medium opacity-70">
            Track how your CO2 offset accumulates over time and download a certificate.
          </Text>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <AnalyticsWidget
              chartType="line"
              title="Cumulative CO2 Offset"
              data={analyticsData}
              dataKeys={['co2Offset']}
              colors={['#14b8a6']}
              showDateRange
              showExport
              showLegend
              height={340}
            />
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-6 space-y-3">
              <Text variant="h3" className="text-xl font-semibold">
                Download Certificate
              </Text>
              <Text variant="muted" className="text-sm leading-6 opacity-80">
                Generate a printable carbon certificate showing your cumulative CO2 offset impact.
              </Text>
            </div>

            <div className="space-y-4 rounded-3xl bg-slate-50 p-4 dark:bg-slate-800">
              <div>
                <Text variant="small" className="text-muted-foreground uppercase tracking-[0.2em]">
                  Current Offset
                </Text>
                <Text variant="h2" className="text-3xl font-black text-stellar-green">
                  {((data?.stats.totalCO2OffsetKg ?? 0) / 1000).toLocaleString()} t
                </Text>
              </div>
              <div>
                <Text variant="small" className="text-muted-foreground uppercase tracking-[0.2em]">
                  Trees planted
                </Text>
                <Text
                  variant="h3"
                  className="text-2xl font-semibold text-slate-900 dark:text-white"
                >
                  {data?.stats.totalDonationsTrees ?? 0}
                </Text>
              </div>
            </div>

            <Button
              onClick={handleCertificateDownload}
              disabled={isCertificateGenerating}
              className="mt-6 w-full gap-2 bg-stellar-blue text-white hover:bg-stellar-blue/90"
              aria-label="Download carbon certificate as PDF"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {isCertificateGenerating ? 'Generating PDF…' : 'Download Carbon Certificate'}
            </Button>

            {certificateDownloadError && (
              <Text variant="small" className="mt-4 text-sm text-destructive">
                {certificateDownloadError}
              </Text>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
