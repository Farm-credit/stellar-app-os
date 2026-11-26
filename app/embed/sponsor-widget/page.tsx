// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

import React from 'react';
import type { Metadata } from 'next';
import { SponsorWidget } from '@/components/organisms/SponsorWidget';
import type { WidgetTheme, WidgetLayout } from '@/lib/types/sponsor-widget';

interface PageProps {
  searchParams: Promise<{
    sponsor?: string;
    theme?: string;
    layout?: string;
    accent?: string;
    showBranding?: string;
    title?: string;
    rewards?: string;
  }>;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const sponsorName = params.sponsor || 'Sponsor';
  return {
    title: `${sponsorName} - Live Impact & Rewards Widget`,
    description: `Live funded trees and community rewards distributed by ${sponsorName} on Stellar.`,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function SponsorWidgetEmbedPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const sponsor = params.sponsor || 'acme-corp';
  const theme = (params.theme as WidgetTheme) || 'auto';
  const layout = (params.layout as WidgetLayout) || 'card';
  const primaryColor = params.accent ? `#${params.accent.replace('#', '')}` : undefined;
  const showBranding = params.showBranding !== 'false';
  const title = params.title || undefined;
  const showRecentRewards = params.rewards !== 'false';

  return (
    <div className="w-full h-full p-2 bg-transparent flex items-center justify-center">
      <div className="w-full max-w-md">
        <SponsorWidget
          sponsor={sponsor}
          theme={theme}
          layout={layout}
          showBranding={showBranding}
          primaryColor={primaryColor}
          title={title}
          showRecentRewards={showRecentRewards}
        />
      </div>
    </div>
  );
}
