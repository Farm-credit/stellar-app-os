import type { Metadata } from 'next';
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
  return <CampaignDetail initialCampaign={campaign} />;
}
