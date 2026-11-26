// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SponsorWidget } from './SponsorWidget';
import type { SponsorWidgetData } from '@/lib/types/sponsor-widget';

const mockSponsorData: SponsorWidgetData = {
  sponsor: {
    walletAddress: 'GACME1111111111111111111111111111111111111111111111111111111',
    brandSlug: 'acme-corp',
    brandName: 'Acme Corp',
    primaryColor: '#10b981',
    isVerifiedOnChain: true,
    stellarExplorerUrl: 'https://stellar.expert/explorer/testnet/account/GACME1111111111111111111111111111111111111111111111111111111',
  },
  metrics: {
    fundedTreesCount: 5420,
    co2OffsetTonnes: 245.8,
    hectaresRestored: 6.8,
    survivalRatePercent: 94.6,
    activeProjectsCount: 3,
  },
  communityRewards: {
    carbonTokensDistributed: 6775,
    nftCertificatesIssued: 120,
    totalRewardsDistributedUsdc: 4607,
    farmersRewardedCount: 18,
    stewardsRewardedCount: 12,
  },
  recentDistributions: [
    {
      id: 'dist-001',
      txHash: 'a7c93e41b9d4f208173456cb019efaa4512e0938b812f8319f39001b672de11a',
      recipientName: 'Aminu Musa',
      recipientRole: 'farmer',
      carbonTokens: 250,
      usdcAmount: 185.5,
      treesVerified: 125,
      timestamp: new Date().toISOString(),
      certificateId: 'NFT-TRE-4401',
    },
  ],
  network: 'testnet',
  updatedAt: new Date().toISOString(),
};

describe('SponsorWidget', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading state when initialData is not provided', () => {
    // Mock fetch pending
    vi.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {}));
    render(<SponsorWidget sponsor="acme-corp" />);
    expect(screen.getByTestId('sponsor-widget-loading')).toBeInTheDocument();
  });

  it('renders correctly with preloaded initialData', () => {
    render(<SponsorWidget sponsor="acme-corp" initialData={mockSponsorData} />);

    expect(screen.getByTestId('sponsor-widget-root')).toBeInTheDocument();
    expect(screen.getByText('Acme Corp Impact')).toBeInTheDocument();
    expect(screen.getByText('5,420')).toBeInTheDocument();
    expect(screen.getByText('245.8')).toBeInTheDocument();
    expect(screen.getByText('6,775 CARBON')).toBeInTheDocument();
    expect(screen.getByText('120 Certificates')).toBeInTheDocument();
    expect(screen.getByText(/30 recipients/i)).toBeInTheDocument();
  });

  it('respects white-label branding options', () => {
    // When showBranding is false, FarmCredit link should not be present
    const { rerender } = render(
      <SponsorWidget sponsor="acme-corp" initialData={mockSponsorData} showBranding={false} />
    );
    expect(screen.queryByText(/Powered by/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Cryptographically Verified/i)).toBeInTheDocument();

    // When showBranding is true, FarmCredit link should appear
    rerender(
      <SponsorWidget sponsor="acme-corp" initialData={mockSponsorData} showBranding={true} />
    );
    expect(screen.getByText(/Powered by/i)).toBeInTheDocument();
    expect(screen.getByText('FarmCredit')).toBeInTheDocument();
  });

  it('opens and closes the recent verified distributions modal', () => {
    render(<SponsorWidget sponsor="acme-corp" initialData={mockSponsorData} />);

    const viewLogsBtn = screen.getByText(/View 1 recent verified payouts/i);
    fireEvent.click(viewLogsBtn);

    expect(screen.getByText('Verified Community Reward Logs')).toBeInTheDocument();
    expect(screen.getByText('Aminu Musa')).toBeInTheDocument();
    expect(screen.getByText('+250 CARBON')).toBeInTheDocument();

    const closeBtn = screen.getByText('Close');
    fireEvent.click(closeBtn);
    expect(screen.queryByText('Verified Community Reward Logs')).not.toBeInTheDocument();
  });

  it('renders error state on API failure', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error connecting to Stellar'));

    render(<SponsorWidget sponsor="unknown-sponsor" />);

    await waitFor(() => {
      expect(screen.getByTestId('sponsor-widget-error')).toBeInTheDocument();
      expect(screen.getByText('Network error connecting to Stellar')).toBeInTheDocument();
    });
  });
});
