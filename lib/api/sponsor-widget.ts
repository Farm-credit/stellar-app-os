// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

import type { SponsorWidgetData, SponsorRewardDistribution } from '@/lib/types/sponsor-widget';
import { getBenefactorLandingPage, getBenefactorConfigByWallet } from '@/lib/api/benefactor-landing';
import { isValidStellarAddress } from '@/lib/api/carbon-impact';

// Default mock distributions for demo / testnet fallback
const sampleDistributions: Record<string, SponsorRewardDistribution[]> = {
  default: [
    {
      id: 'dist-001',
      txHash: 'a7c93e41b9d4f208173456cb019efaa4512e0938b812f8319f39001b672de11a',
      recipientName: 'Aminu Musa',
      recipientRole: 'farmer',
      carbonTokens: 250,
      usdcAmount: 185.5,
      treesVerified: 125,
      timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
      certificateId: 'NFT-TRE-4401',
    },
    {
      id: 'dist-002',
      txHash: 'd382109ab7c312ef45a892019482718102374981723401827391029384758201',
      recipientName: 'Amina Bello Cooperative',
      recipientRole: 'community_steward',
      carbonTokens: 520,
      usdcAmount: 390.0,
      treesVerified: 320,
      timestamp: new Date(Date.now() - 3600000 * 22).toISOString(),
      certificateId: 'NFT-TRE-4398',
    },
    {
      id: 'dist-003',
      txHash: '8912efca31829381723019827301928475819203948172301982374918237491',
      recipientName: 'Samuel Kiprop',
      recipientRole: 'farmer',
      carbonTokens: 180,
      usdcAmount: 135.0,
      treesVerified: 90,
      timestamp: new Date(Date.now() - 3600000 * 48).toISOString(),
      certificateId: 'NFT-TRE-4385',
    },
    {
      id: 'dist-004',
      txHash: '5561a09bc3182736192837491827391029384758192039481723019827361928',
      recipientName: 'Maria Dos Santos',
      recipientRole: 'community_steward',
      carbonTokens: 410,
      usdcAmount: 307.5,
      treesVerified: 210,
      timestamp: new Date(Date.now() - 3600000 * 72).toISOString(),
      certificateId: 'NFT-TRE-4370',
    },
  ],
};

/**
 * Resolves sponsor data for the white-label embed widget.
 * Accepts either a Stellar 56-character public key (G...) or a brand slug.
 */
export async function getSponsorWidgetData(identifier: string): Promise<SponsorWidgetData | null> {
  if (!identifier || typeof identifier !== 'string') {
    return null;
  }

  const cleanId = identifier.trim();
  const isStellar = isValidStellarAddress(cleanId);

  // Check in benefactor landing pages / configs
  let landingData = isStellar ? null : getBenefactorLandingPage(cleanId, { requirePublished: false });
  let config = landingData?.config;

  if (!config && isStellar) {
    const byWallet = getBenefactorConfigByWallet(cleanId);
    if (byWallet) {
      config = byWallet;
      landingData = getBenefactorLandingPage(byWallet.brandSlug, { requirePublished: false });
    }
  }

  // If not in seeded configs, provide a deterministic fallback for arbitrary Stellar addresses
  const walletAddress = config?.walletAddress || (isStellar ? cleanId : `G${cleanId.toUpperCase().padEnd(55, '9')}`);
  const brandSlug = config?.brandSlug || cleanId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const brandName = config?.brandName || (isStellar ? `Sponsor ${cleanId.slice(0, 4)}...${cleanId.slice(-4)}` : cleanId.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' '));
  const primaryColor = config?.primaryColor || '#10b981';
  const logoUrl = config?.logoUrl || undefined;
  const websiteUrl = config?.websiteUrl || undefined;

  // Compute live metrics
  const fundedTreesCount = landingData?.metrics.totalTreesFunded || 5420;
  const co2OffsetTonnes = landingData?.metrics.totalCo2Tonnes || 245.8;
  const supportedFarmers = landingData?.metrics.supportedFarmersCount || 18;
  const supportedStewards = landingData?.metrics.supportedStewardsCount || 12;
  const activeProjects = landingData?.metrics.activeProjectsCount || (landingData?.projects.length ?? 3);

  // Community rewards calculation
  // Carbon tokens: ~1.2 tokens per tree planted & verified
  const carbonTokensDistributed = Math.round(fundedTreesCount * 1.25);
  // NFT Certificates: 1 per verified milestone batch
  const nftCertificatesIssued = Math.max(1, Math.round(fundedTreesCount / 45));
  // Financial rewards: ~$0.85 per tree equivalent paid to farmers & stewards
  const totalRewardsDistributedUsdc = Math.round(fundedTreesCount * 0.85 * 100) / 100;

  const distributions = sampleDistributions[brandSlug] || sampleDistributions.default;

  return {
    sponsor: {
      walletAddress,
      brandSlug,
      brandName,
      logoUrl,
      websiteUrl,
      primaryColor,
      isVerifiedOnChain: true,
      contractAddress: process.env.NEXT_PUBLIC_CONTRACT_CARBON_CREDITS || 'CA7Q...TESTNET',
      stellarExplorerUrl: `https://stellar.expert/explorer/testnet/account/${walletAddress}`,
    },
    metrics: {
      fundedTreesCount,
      co2OffsetTonnes,
      hectaresRestored: Math.round((fundedTreesCount / 800) * 10) / 10,
      survivalRatePercent: 94.6,
      activeProjectsCount: activeProjects,
    },
    communityRewards: {
      carbonTokensDistributed,
      nftCertificatesIssued,
      totalRewardsDistributedUsdc,
      farmersRewardedCount: supportedFarmers,
      stewardsRewardedCount: supportedStewards,
    },
    recentDistributions: distributions,
    network: 'testnet',
    updatedAt: new Date().toISOString(),
  };
}
