// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

export type WidgetTheme = 'light' | 'dark' | 'auto';
export type WidgetLayout = 'card' | 'badge' | 'banner' | 'compact';

export interface SponsorRewardDistribution {
  id: string;
  txHash: string;
  recipientName: string;
  recipientRole: 'farmer' | 'community_steward' | 'urban_planter';
  carbonTokens: number;
  usdcAmount: number;
  treesVerified: number;
  timestamp: string;
  certificateId?: string;
}

export interface SponsorWidgetData {
  sponsor: {
    walletAddress: string;
    brandSlug: string;
    brandName: string;
    logoUrl?: string;
    websiteUrl?: string;
    primaryColor: string;
    isVerifiedOnChain: boolean;
    contractAddress?: string;
    stellarExplorerUrl?: string;
  };
  metrics: {
    fundedTreesCount: number;
    co2OffsetTonnes: number;
    hectaresRestored: number;
    survivalRatePercent: number;
    activeProjectsCount: number;
  };
  communityRewards: {
    carbonTokensDistributed: number;
    nftCertificatesIssued: number;
    totalRewardsDistributedUsdc: number;
    farmersRewardedCount: number;
    stewardsRewardedCount: number;
  };
  recentDistributions: SponsorRewardDistribution[];
  network: 'testnet' | 'mainnet';
  updatedAt: string;
}

export interface SponsorWidgetConfig {
  sponsor: string; // wallet address or brand slug
  theme?: WidgetTheme;
  layout?: WidgetLayout;
  primaryColor?: string;
  showBranding?: boolean; // white-label option: false to hide FarmCredit branding
  title?: string;
  showRecentRewards?: boolean;
}
