export type TelemetryTimeframe = "7d" | "30d" | "90d" | "1y" | "all";

export const VALID_TIMEFRAMES: readonly TelemetryTimeframe[] = [
  "7d",
  "30d",
  "90d",
  "1y",
  "all",
] as const;

export interface TelemetryDataPoint {
  period: string;
  co2SequesteredKg: number;
  cumulativeCo2Kg: number;
  waterTableLiters: number;
  carbonTokensDistributed: number;
  nftCertificatesMinted: number;
}

export interface BenefactorPoolTelemetry {
  poolId: string;
  poolName: string;
  contractAddress: string;
  region: string;
  fundedUsdc: number;
  co2SequesteredKg: number;
  waterTableLiters: number;
  carbonTokensDistributed: number;
  nftCertificatesMinted: number;
  farmerStewards: number;
  communityStewards: number;
  status: "active" | "verifying" | "completed";
}

export interface TelemetrySummary {
  totalCo2Tonnes: number;
  co2GrowthPct: number;
  totalWaterTableKiloLiters: number;
  waterGrowthPct: number;
  totalCarbonTokens: number;
  totalNftCertificates: number;
  totalBenefactorFundingUsdc: number;
  activeFarmerStewards: number;
  activeCommunityStewards: number;
  stellarNetwork: "testnet" | "mainnet";
  contractId: string;
  ledgerSequence: number;
  lastSyncedAt: string;
}

export interface SponsorTelemetryPayload {
  timeframe: TelemetryTimeframe;
  poolId: string;
  summary: TelemetrySummary;
  timeSeries: TelemetryDataPoint[];
  pools: BenefactorPoolTelemetry[];
}

export function isValidTimeframe(value: string): value is TelemetryTimeframe {
  return (VALID_TIMEFRAMES as readonly string[]).includes(value);
}

export function formatTonnes(kg: number): string {
  const tonnes = kg / 1000;
  return `${tonnes.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} tCO2e`;
}

export function formatWaterKiloLiters(liters: number): string {
  const kl = liters / 1000;
  return `${kl.toLocaleString("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} kL`;
}

export function formatCredits(amount: number): string {
  return `${Math.round(amount).toLocaleString("en-US")} CARBON`;
}

export function formatUsdc(amount: number): string {
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

export function computeGrowthPct(current: number, previous: number): number {
  if (previous <= 0) return 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

const BASE_POOLS: BenefactorPoolTelemetry[] = [
  {
    poolId: "pool-rift-valley",
    poolName: "Rift Valley Agroforestry Fund",
    contractAddress: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
    region: "East Africa",
    fundedUsdc: 185000,
    co2SequesteredKg: 412800,
    waterTableLiters: 1840000,
    carbonTokensDistributed: 41280,
    nftCertificatesMinted: 312,
    farmerStewards: 148,
    communityStewards: 64,
    status: "active",
  },
  {
    poolId: "pool-mekong-watershed",
    poolName: "Mekong Watershed Restoration Pool",
    contractAddress: "CA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJUWDA",
    region: "Southeast Asia",
    fundedUsdc: 142500,
    co2SequesteredKg: 328400,
    waterTableLiters: 2650000,
    carbonTokensDistributed: 32840,
    nftCertificatesMinted: 245,
    farmerStewards: 112,
    communityStewards: 89,
    status: "active",
  },
  {
    poolId: "pool-andes-silvopasture",
    poolName: "Andes Silvopasture Corridor",
    contractAddress: "CBQHNAXSI55GX2GN6D67GK7BHVPSLJUGZQEU7WJ5LKR5PNUCGLIMAO4K",
    region: "South America",
    fundedUsdc: 98000,
    co2SequesteredKg: 215600,
    waterTableLiters: 1190000,
    carbonTokensDistributed: 21560,
    nftCertificatesMinted: 178,
    farmerStewards: 84,
    communityStewards: 51,
    status: "verifying",
  },
  {
    poolId: "pool-sahel-greenbelt",
    poolName: "Sahel Community Greenbelt Pool",
    contractAddress: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
    region: "West Africa",
    fundedUsdc: 124000,
    co2SequesteredKg: 289200,
    waterTableLiters: 1520000,
    carbonTokensDistributed: 28920,
    nftCertificatesMinted: 229,
    farmerStewards: 126,
    communityStewards: 94,
    status: "active",
  },
];

const TIMEFRAME_CONFIG: Record<
  TelemetryTimeframe,
  { labels: string[]; scale: number; growthCo2: number; growthWater: number }
> = {
  "7d": {
    labels: ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7"],
    scale: 0.08,
    growthCo2: 4.2,
    growthWater: 3.8,
  },
  "30d": {
    labels: ["Wk 1", "Wk 2", "Wk 3", "Wk 4"],
    scale: 0.25,
    growthCo2: 11.6,
    growthWater: 9.4,
  },
  "90d": {
    labels: ["Month 1", "Month 2", "Month 3"],
    scale: 0.55,
    growthCo2: 18.9,
    growthWater: 15.2,
  },
  "1y": {
    labels: ["Q1", "Q2", "Q3", "Q4"],
    scale: 0.85,
    growthCo2: 27.4,
    growthWater: 22.1,
  },
  all: {
    labels: ["2023 H2", "2024 H1", "2024 H2", "2025 H1", "2025 H2", "2026 YTD"],
    scale: 1,
    growthCo2: 34.8,
    growthWater: 29.5,
  },
};

export function buildSponsorTelemetry(
  timeframe: TelemetryTimeframe = "30d",
  poolId: string = "all",
): SponsorTelemetryPayload {
  const config = TIMEFRAME_CONFIG[timeframe];
  const filteredPools =
    poolId === "all"
      ? BASE_POOLS
      : BASE_POOLS.filter((pool) => pool.poolId === poolId);

  const activePools = filteredPools.length > 0 ? filteredPools : BASE_POOLS;

  const scaledPools: BenefactorPoolTelemetry[] = activePools.map((pool) => ({
    ...pool,
    co2SequesteredKg: Math.round(pool.co2SequesteredKg * config.scale),
    waterTableLiters: Math.round(pool.waterTableLiters * config.scale),
    carbonTokensDistributed: Math.round(
      pool.carbonTokensDistributed * config.scale,
    ),
    nftCertificatesMinted: Math.max(
      1,
      Math.round(pool.nftCertificatesMinted * config.scale),
    ),
  }));

  const totalCo2Kg = scaledPools.reduce((sum, p) => sum + p.co2SequesteredKg, 0);
  const totalWaterLiters = scaledPools.reduce(
    (sum, p) => sum + p.waterTableLiters,
    0,
  );
  const totalCarbonTokens = scaledPools.reduce(
    (sum, p) => sum + p.carbonTokensDistributed,
    0,
  );
  const totalNftCertificates = scaledPools.reduce(
    (sum, p) => sum + p.nftCertificatesMinted,
    0,
  );
  const totalBenefactorFundingUsdc = scaledPools.reduce(
    (sum, p) => sum + p.fundedUsdc,
    0,
  );
  const activeFarmerStewards = scaledPools.reduce(
    (sum, p) => sum + p.farmerStewards,
    0,
  );
  const activeCommunityStewards = scaledPools.reduce(
    (sum, p) => sum + p.communityStewards,
    0,
  );

  const pointCount = config.labels.length;
  const weights = config.labels.map((_, idx) => 0.75 + (idx / Math.max(1, pointCount - 1)) * 0.5);
  const weightSum = weights.reduce((acc, w) => acc + w, 0);

  let cumulativeCo2Kg = 0;
  const timeSeries: TelemetryDataPoint[] = config.labels.map((label, idx) => {
    const share = weights[idx] / weightSum;
    const co2SequesteredKg = Math.round(totalCo2Kg * share);
    cumulativeCo2Kg += co2SequesteredKg;
    return {
      period: label,
      co2SequesteredKg,
      cumulativeCo2Kg,
      waterTableLiters: Math.round(totalWaterLiters * share),
      carbonTokensDistributed: Math.round(totalCarbonTokens * share),
      nftCertificatesMinted: Math.max(
        1,
        Math.round(totalNftCertificates * share),
      ),
    };
  });

  const contractId =
    process.env.NEXT_PUBLIC_SOROBAN_REWARD_POOL_CONTRACT_ID ||
    "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

  const stellarNetwork =
    process.env.NEXT_PUBLIC_STELLAR_NETWORK === "mainnet"
      ? "mainnet"
      : "testnet";

  return {
    timeframe,
    poolId: filteredPools.length > 0 ? poolId : "all",
    summary: {
      totalCo2Tonnes: Number((totalCo2Kg / 1000).toFixed(1)),
      co2GrowthPct: config.growthCo2,
      totalWaterTableKiloLiters: Number((totalWaterLiters / 1000).toFixed(1)),
      waterGrowthPct: config.growthWater,
      totalCarbonTokens,
      totalNftCertificates,
      totalBenefactorFundingUsdc,
      activeFarmerStewards,
      activeCommunityStewards,
      stellarNetwork,
      contractId,
      ledgerSequence: 51482910 + Math.floor(Date.now() / 60000) % 1000,
      lastSyncedAt: new Date().toISOString(),
    },
    timeSeries,
    pools: scaledPools,
  };
}
