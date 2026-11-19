import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CampaignDetail } from '@/components/organisms/CampaignDetail/CampaignDetail';
import { CAMPAIGNS, getCampaign } from '@/lib/campaigns/data';

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

  return (
    <div>
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
      <CampaignDetail initialCampaign={campaign} />
    </div>
  );
}