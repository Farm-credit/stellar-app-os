import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { WhiteLabelFrame } from '@/components/organisms/WhiteLabel/WhiteLabelFrame';
import { WhiteLabelSettingsForm } from '@/components/organisms/WhiteLabel/WhiteLabelSettingsForm';
import { PROJECT_IMPACT_DIMENSIONS } from '@/lib/impact/project-impact';
import { buildPartnerImpactFeed, getWhiteLabelConfig } from '@/lib/whiteLabel';

interface Props {
  params: Promise<{ partnerId: string }>;
}

/**
 * Partner admin panel: the consolidated impact feed from all white-label
 * projects plus branding and fee/margin configuration. (#1713)
 */
export default async function PartnerAdminPage({ params }: Props): Promise<ReactNode> {
  const { partnerId } = await params;
  const config = getWhiteLabelConfig(partnerId);

  if (!config) {
    notFound();
    return null;
  }

  const feed = buildPartnerImpactFeed(config);

  return (
    <WhiteLabelFrame config={config}>
      <div className="mx-auto max-w-5xl space-y-10">
        <section className="space-y-4" data-testid="wl-impact-feed">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--wl-primary)' }}>
              Impact dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              All sponsorship impact from your branded projects, updated {feed.asOf}.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {PROJECT_IMPACT_DIMENSIONS.map((meta) => {
              const metric = feed.totals[meta.dimension];
              return (
                <div
                  key={meta.dimension}
                  className="rounded-lg border border-black/10 bg-white p-4 dark:bg-card"
                >
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {meta.label}
                  </p>
                  <p className="mt-1 text-xl font-bold" style={{ color: 'var(--wl-accent)' }}>
                    {metric.value.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {meta.unit}
                    {metric.change !== 0 && ` • ${metric.change > 0 ? '+' : ''}${metric.change}%`}
                  </p>
                </div>
              );
            })}
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 font-medium">Project</th>
                {PROJECT_IMPACT_DIMENSIONS.map((meta) => (
                  <th key={meta.dimension} className="py-2 font-medium">
                    {meta.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {feed.projects.map((project) => (
                <tr key={project.projectId} className="border-b border-black/5">
                  <td className="py-2 font-medium">{project.projectId}</td>
                  {PROJECT_IMPACT_DIMENSIONS.map((meta) => (
                    <td key={meta.dimension} className="py-2">
                      {project.snapshot[meta.dimension].value.toLocaleString()}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold" style={{ color: 'var(--wl-primary)' }}>
              White-label settings
            </h2>
            <p className="text-sm text-muted-foreground">
              Configure your brand colors, logo domain and the fee split on each sponsorship.
            </p>
          </div>
          <WhiteLabelSettingsForm config={config} />
        </section>
      </div>
    </WhiteLabelFrame>
  );
}
