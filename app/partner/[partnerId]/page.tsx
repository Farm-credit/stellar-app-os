import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { WhiteLabelFrame } from '@/components/organisms/WhiteLabel/WhiteLabelFrame';
import { getWhiteLabelConfig, splitSponsorshipPrice } from '@/lib/whiteLabel';
import { MOCK_TREE_SPONSORSHIP_OFFERINGS } from '@/lib/treeSponsorshipComparison';

interface Props {
  params: Promise<{ partnerId: string }>;
}

/**
 * White-label sponsored tree storefront hosted/embedded by a partner
 * organisation under its own brand and domain. (#1713)
 */
export default async function PartnerStorefrontPage({ params }: Props): Promise<ReactNode> {
  const { partnerId } = await params;
  const config = getWhiteLabelConfig(partnerId);

  if (!config || !config.enabled) {
    notFound();
    return null;
  }

  const offerings = MOCK_TREE_SPONSORSHIP_OFFERINGS.filter((offering) =>
    config.projectIds.includes(offering.projectId)
  );

  return (
    <WhiteLabelFrame config={config}>
      <div className="mx-auto max-w-5xl space-y-8">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--wl-primary)' }}>
            Sponsor a tree with {config.branding.partnerName}
          </h1>
          <p className="mt-2 text-muted-foreground">
            Every sponsorship funds verified planting projects. Hosted at{' '}
            {config.branding.customDomain}.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {offerings.map((offering) => {
            const breakdown = splitSponsorshipPrice(offering.cost, config.fees);
            return (
              <div
                key={offering.id}
                className="rounded-xl border border-black/10 bg-white p-5 shadow-sm dark:bg-card"
                data-testid={`wl-offering-${offering.projectId}`}
              >
                <h2 className="text-lg font-semibold">{offering.projectName}</h2>
                <p className="text-sm text-muted-foreground">{offering.location}</p>
                <p className="mt-3 text-2xl font-bold" style={{ color: 'var(--wl-accent)' }}>
                  ${breakdown.totalUsd.toFixed(2)}
                  <span className="text-sm font-normal text-muted-foreground"> / tree</span>
                </p>
                <dl className="mt-3 space-y-1 text-sm text-muted-foreground">
                  <div className="flex justify-between">
                    <dt>Grower planting share</dt>
                    <dd>${breakdown.growerShareUsd.toFixed(2)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>{config.branding.partnerName} margin</dt>
                    <dd>${breakdown.partnerMarginUsd.toFixed(2)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Platform fee</dt>
                    <dd>${breakdown.platformFeeUsd.toFixed(2)}</dd>
                  </div>
                </dl>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/10">
                  <div className="flex h-full">
                    <div
                      style={{
                        width: `${(breakdown.growerShareUsd / breakdown.totalUsd) * 100}%`,
                        backgroundColor: 'var(--wl-accent)',
                      }}
                    />
                    <div
                      style={{
                        width: `${(breakdown.partnerMarginUsd / breakdown.totalUsd) * 100}%`,
                        backgroundColor: 'var(--wl-primary)',
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </WhiteLabelFrame>
  );
}
