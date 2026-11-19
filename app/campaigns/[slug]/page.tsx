import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CampaignDetail } from '@/components/organisms/CampaignDetail/CampaignDetail';
import { CAMPAIGNS, getCampaign } from '@/lib/campaigns/data';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

function daysRemaining(deadline: string): number {
  const end = new Date(deadline).getTime();
  if (Number.isNaN(end)) return 0;
  const diff = end - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function generateStaticParams() {
  return CAMPAIGNS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const campaign = getCampaign(slug);
  return { title: campaign ? campaign.title : 'Campaign not found' };
}

export default async function CampaignPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const campaign = getCampaign(slug);
  if (!campaign) notFound();

  const charity = campaign.charity;
  const education = campaign.education;
  const pledges = campaign.corporatePledges ?? [];
  const daysLeft = campaign.deadline ? daysRemaining(campaign.deadline) : null;
  const treesRemaining =
    campaign.goalTrees != null ? Math.max(0, campaign.goalTrees - campaign.treesPlanted) : null;

  return (
    <div>
      {(daysLeft !== null || treesRemaining !== null) && (
        <div className="mx-auto max-w-5xl px-4 pt-6">
          <div className="flex flex-wrap items-center gap-6 rounded-lg border border-amber-300 bg-amber-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
              Urgent funding needed
            </p>
            {daysLeft !== null && (
              <div>
                <p className="text-2xl font-bold text-amber-900">{daysLeft}</p>
                <p className="text-xs text-amber-700">
                  {daysLeft === 1 ? 'day remaining' : 'days remaining'}
                </p>
              </div>
            )}
            {treesRemaining !== null && (
              <div>
                <p className="text-2xl font-bold text-amber-900">
                  {treesRemaining.toLocaleString()}
                </p>
                <p className="text-xs text-amber-700">trees remaining</p>
              </div>
            )}
          </div>
        </div>
      )}
      {education && (
        <div className="mx-auto max-w-5xl px-4 pt-6">
          <section
            aria-labelledby="biome-education-heading"
            className="rounded-lg border border-emerald-200 bg-emerald-50 p-6"
          >
            <h2
              id="biome-education-heading"
              className="text-lg font-semibold text-emerald-900"
            >
              {education.biomeName}
            </h2>
            <p className="mt-2 text-sm text-emerald-800">{education.summary}</p>
            {education.threats.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-emerald-900">Key threats</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-emerald-800">
                  {education.threats.map((threat) => (
                    <li key={threat}>{threat}</li>
                  ))}
                </ul>
              </div>
            )}
            {education.facts.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-emerald-900">Did you know?</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-emerald-800">
                  {education.facts.map((fact) => (
                    <li key={fact}>{fact}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      )}
      {pledges.length > 0 && (
        <div className="mx-auto max-w-5xl px-4 pt-6">
          <section
            aria-labelledby="corporate-match-heading"
            className="rounded-lg border border-gray-200 bg-white p-6"
          >
            <h2 id="corporate-match-heading" className="text-lg font-semibold text-gray-900">
              Corporate match fund
            </h2>
            <ul className="mt-4 space-y-4">
              {pledges.map((pledge) => {
                const remaining = Math.max(0, pledge.matchTarget - pledge.matchedAmount);
                const progress =
                  pledge.matchTarget > 0
                    ? Math.min(100, Math.round((pledge.matchedAmount / pledge.matchTarget) * 100))
                    : 0;
                return (
                  <li key={pledge.id} className="rounded-md border border-gray-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-gray-900">{pledge.corporateName}</p>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                        {pledge.multiplier}x match
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600">
                      <span>Target: {formatCurrency(pledge.matchTarget)}</span>
                      <span>Matched: {formatCurrency(pledge.matchedAmount)}</span>
                      <span className="font-medium text-gray-900">
                        Remaining match: {formatCurrency(remaining)}
                      </span>
                    </div>
                    <div
                      className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200"
                      role="progressbar"
                      aria-valuenow={progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${pledge.corporateName} match progress`}
                    >
                      <div className="h-full bg-emerald-600" style={{ width: `${progress}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}
      {charity && (
        <div className="mx-auto max-w-5xl px-4 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center gap-3">
              {charity.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={charity.logoUrl}
                  alt={`${charity.name} logo`}
                  className="h-10 w-10 rounded-full object-contain"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-sm font-semibold text-gray-600"
                >
                  {charity.name.charAt(0)}
                </span>
              )}
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">In partnership with</p>
                <p className="text-sm font-semibold text-gray-900">{charity.name}</p>
              </div>
            </div>
            <Link
              href={`/api/charity/impact-report?campaign=${encodeURIComponent(slug)}`}
              className="inline-flex items-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
            >
              Download shared impact report
            </Link>
          </div>
        </div>
      )}
      <CampaignDetail initialCampaign={campaign} education={education} corporatePledges={pledges} />
    </div>
  );
}