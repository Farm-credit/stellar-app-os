"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertCircle,
  Award,
  Droplets,
  Leaf,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  formatCredits,
  formatTonnes,
  formatUsdc,
  formatWaterKiloLiters,
  VALID_TIMEFRAMES,
  type SponsorTelemetryPayload,
  type TelemetryTimeframe,
} from "@/lib/sponsor-telemetry";

const TIMEFRAME_LABELS: Record<TelemetryTimeframe, string> = {
  "7d": "7D",
  "30d": "30D",
  "90d": "90D",
  "1y": "1Y",
  all: "All",
};

const AUTO_REFRESH_MS = 30_000;

export default function SponsorTelemetryPage() {
  const [timeframe, setTimeframe] = useState<TelemetryTimeframe>("30d");
  const [selectedPoolId, setSelectedPoolId] = useState<string>("all");
  const [liveSync, setLiveSync] = useState<boolean>(true);
  const [data, setData] = useState<SponsorTelemetryPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTelemetry = useCallback(
    async (tf: TelemetryTimeframe, pool: string) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          timeframe: tf,
          poolId: pool,
        });
        const response = await fetch(`/api/sponsor/telemetry?${params.toString()}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(
            body.error || `Telemetry request failed (${response.status})`,
          );
        }

        const payload = (await response.json()) as SponsorTelemetryPayload;
        setData(payload);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to fetch ESG telemetry data",
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void fetchTelemetry(timeframe, selectedPoolId);
  }, [timeframe, selectedPoolId, fetchTelemetry]);

  useEffect(() => {
    if (!liveSync) return;
    const intervalId = setInterval(() => {
      void fetchTelemetry(timeframe, selectedPoolId);
    }, AUTO_REFRESH_MS);
    return () => clearInterval(intervalId);
  }, [liveSync, timeframe, selectedPoolId, fetchTelemetry]);

  const poolComparisonData =
    data?.pools.map((pool) => ({
      name: pool.poolName.replace(" Fund", "").replace(" Pool", ""),
      carbonTokens: pool.carbonTokensDistributed,
      co2Tonnes: Number((pool.co2SequesteredKg / 1000).toFixed(1)),
      waterKL: Number((pool.waterTableLiters / 1000).toFixed(1)),
    })) ?? [];

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      {/* Header & Controls */}
      <header className="flex flex-col gap-4 border-b pb-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
              <Activity className="h-3.5 w-3.5" aria-hidden="true" />
              Stellar {data?.summary.stellarNetwork ?? "testnet"} Live Telemetry
            </span>
            {data?.summary.ledgerSequence ? (
              <span className="text-xs text-muted-foreground">
                Ledger #{data.summary.ledgerSequence.toLocaleString("en-US")}
              </span>
            ) : null}
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Corporate ESG Telemetry Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Real-time CO2 offset analytics, water table recharge impact, and
            community CARBON credit distributions funded by benefactor pools.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Timeframe Selector */}
          <div
            role="group"
            aria-label="Telemetry timeframe"
            className="inline-flex rounded-lg border bg-background p-1"
          >
            {VALID_TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                aria-pressed={timeframe === tf}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  timeframe === tf
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {TIMEFRAME_LABELS[tf]}
              </button>
            ))}
          </div>

          {/* Pool Filter */}
          <select
            aria-label="Filter by benefactor pool"
            value={selectedPoolId}
            onChange={(e) => setSelectedPoolId(e.target.value)}
            className="rounded-lg border bg-background px-3 py-2 text-xs font-medium text-foreground"
          >
            <option value="all">All Benefactor Pools</option>
            <option value="pool-rift-valley">Rift Valley Agroforestry Fund</option>
            <option value="pool-mekong-watershed">
              Mekong Watershed Restoration Pool
            </option>
            <option value="pool-andes-silvopasture">
              Andes Silvopasture Corridor
            </option>
            <option value="pool-sahel-greenbelt">
              Sahel Community Greenbelt Pool
            </option>
          </select>

          {/* Live Toggle */}
          <button
            type="button"
            onClick={() => setLiveSync((prev) => !prev)}
            aria-pressed={liveSync}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition ${
              liveSync
                ? "border-emerald-500/40 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "bg-background text-muted-foreground"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                liveSync ? "animate-pulse bg-emerald-500" : "bg-muted-foreground"
              }`}
            />
            {liveSync ? "Auto-Sync On" : "Auto-Sync Paused"}
          </button>

          {/* Manual Refresh */}
          <button
            type="button"
            onClick={() => void fetchTelemetry(timeframe, selectedPoolId)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            Refresh
          </button>
        </div>
      </header>

      {/* Error Banner */}
      {error ? (
        <div
          role="alert"
          className="flex flex-col items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200 sm:flex-row sm:items-center"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">Telemetry sync error</p>
              <p className="text-xs opacity-90">{error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void fetchTelemetry(timeframe, selectedPoolId)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </button>
        </div>
      ) : null}

      {/* Loading Skeleton */}
      {loading && !data ? (
        <div
          data-testid="telemetry-loading"
          className="space-y-6"
          aria-busy="true"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-32 animate-pulse rounded-xl border bg-muted/40"
              />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="h-80 animate-pulse rounded-xl border bg-muted/40" />
            <div className="h-80 animate-pulse rounded-xl border bg-muted/40" />
          </div>
        </div>
      ) : null}

      {/* Dashboard Content */}
      {data ? (
        <>
          {/* KPI Summary Cards */}
          <section
            aria-label="Key ESG telemetry metrics"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <article className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Aggregate CO2 Sequestered
                </span>
                <Leaf
                  className="h-4 w-4 text-emerald-600"
                  aria-hidden="true"
                />
              </div>
              <p
                data-testid="kpi-co2"
                className="mt-2 text-2xl font-bold text-foreground"
              >
                {data.summary.totalCo2Tonnes.toLocaleString("en-US", {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}{" "}
                tCO2e
              </p>
              <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                +{data.summary.co2GrowthPct}% vs prior period
              </p>
            </article>

            <article className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Water Table Impact
                </span>
                <Droplets
                  className="h-4 w-4 text-sky-600"
                  aria-hidden="true"
                />
              </div>
              <p
                data-testid="kpi-water"
                className="mt-2 text-2xl font-bold text-foreground"
              >
                {data.summary.totalWaterTableKiloLiters.toLocaleString("en-US", {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}{" "}
                kL
              </p>
              <p className="mt-1 text-xs text-sky-600 dark:text-sky-400">
                +{data.summary.waterGrowthPct}% aquifer recharge
              </p>
            </article>

            <article className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Community Credits Distributed
                </span>
                <Award
                  className="h-4 w-4 text-amber-600"
                  aria-hidden="true"
                />
              </div>
              <p
                data-testid="kpi-credits"
                className="mt-2 text-2xl font-bold text-foreground"
              >
                {formatCredits(data.summary.totalCarbonTokens)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {data.summary.totalNftCertificates.toLocaleString("en-US")} NFT
                impact certificates minted
              </p>
            </article>

            <article className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Benefactor Pool Funding
                </span>
                <Users
                  className="h-4 w-4 text-indigo-600"
                  aria-hidden="true"
                />
              </div>
              <p
                data-testid="kpi-funding"
                className="mt-2 text-2xl font-bold text-foreground"
              >
                {formatUsdc(data.summary.totalBenefactorFundingUsdc)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {data.summary.activeFarmerStewards} farmers &amp;{" "}
                {data.summary.activeCommunityStewards} community stewards
              </p>
            </article>
          </section>

          {/* Interactive Charts Row 1 */}
          <section
            aria-label="Real-time ecological telemetry charts"
            className="grid grid-cols-1 gap-6 lg:grid-cols-2"
          >
            {/* CO2 Sequestration Area Chart */}
            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-foreground">
                  Real-Time CO2 Sequestration Analytics
                </h2>
                <p className="text-xs text-muted-foreground">
                  Verified periodic and cumulative carbon sequestered (kg CO2e)
                </p>
              </div>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={data.timeSeries}
                    margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="co2SequesteredKg"
                      name="Periodic CO2 (kg)"
                      stroke="#059669"
                      fill="#10b981"
                      fillOpacity={0.25}
                    />
                    <Area
                      type="monotone"
                      dataKey="cumulativeCo2Kg"
                      name="Cumulative CO2 (kg)"
                      stroke="#047857"
                      fill="#047857"
                      fillOpacity={0.1}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Water Table Impact Bar Chart */}
            <div className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-foreground">
                  Water Table Recharge Impact
                </h2>
                <p className="text-xs text-muted-foreground">
                  Watershed retention and groundwater recharge volume (liters)
                </p>
              </div>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.timeSeries}
                    margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar
                      dataKey="waterTableLiters"
                      name="Water Recharged (L)"
                      fill="#0284c7"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* Interactive Chart Row 2: Community Credits Distributed by Benefactor Fund */}
          <section
            aria-label="Community credits by benefactor fund"
            className="rounded-xl border bg-card p-5 shadow-sm"
          >
            <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Community Credits Distributed by Benefactor Fund
                </h2>
                <p className="text-xs text-muted-foreground">
                  CARBON reward tokens distributed to farmer and non-farmer
                  community stewards per Soroban reward pool
                </p>
              </div>
              <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck
                  className="h-4 w-4 text-emerald-600"
                  aria-hidden="true"
                />
                Contract:{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                  {data.summary.contractId.slice(0, 8)}...
                  {data.summary.contractId.slice(-6)}
                </code>
              </div>
            </div>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={poolComparisonData}
                  margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar
                    dataKey="carbonTokens"
                    name="CARBON Credits Distributed"
                    fill="#d97706"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Benefactor Pools Table */}
          <section
            aria-label="Benefactor reward pools breakdown"
            className="overflow-hidden rounded-xl border bg-card shadow-sm"
          >
            <div className="border-b px-5 py-4">
              <h2 className="text-base font-semibold text-foreground">
                Benefactor Reward Pools &amp; Steward Impact
              </h2>
              <p className="text-xs text-muted-foreground">
                On-chain verified ecological outcomes across active Stellar
                Soroban reward pools
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3">Benefactor Pool</th>
                    <th className="px-5 py-3">Region</th>
                    <th className="px-5 py-3">CO2 Sequestered</th>
                    <th className="px-5 py-3">Water Impact</th>
                    <th className="px-5 py-3">Credits &amp; NFTs</th>
                    <th className="px-5 py-3">Stewards</th>
                    <th className="px-5 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.pools.map((pool) => (
                    <tr key={pool.poolId} className="hover:bg-muted/20">
                      <td className="px-5 py-3.5">
                        <div className="font-medium text-foreground">
                          {pool.poolName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {pool.contractAddress.slice(0, 10)}...
                          {pool.contractAddress.slice(-6)}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground">
                        {pool.region}
                      </td>
                      <td className="px-5 py-3.5 font-medium text-emerald-700 dark:text-emerald-400">
                        {formatTonnes(pool.co2SequesteredKg)}
                      </td>
                      <td className="px-5 py-3.5 text-sky-700 dark:text-sky-400">
                        {formatWaterKiloLiters(pool.waterTableLiters)}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-medium text-foreground">
                          {formatCredits(pool.carbonTokensDistributed)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {pool.nftCertificatesMinted} NFTs
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-muted-foreground">
                        {pool.farmerStewards} farmers /{" "}
                        {pool.communityStewards} community
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                            pool.status === "active"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                              : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                          }`}
                        >
                          {pool.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
