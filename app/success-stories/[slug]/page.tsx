import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FarmerStoryDetail } from '@/components/organisms/FarmerSuccessStories/FarmerStoryDetail';
import {
  farmerSuccessStories,
  fetchFarmerSuccessStoryBySlug,
  fetchFarmerSuccessStories,
} from '@/lib/api/mock/farmerSuccessStories';
import type { FarmerSuccessStory } from '@/lib/types/farmer-success-story';

interface FarmerStoryPageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return farmerSuccessStories.map((story) => ({ slug: story.slug }));
}

export async function generateMetadata({ params }: FarmerStoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const story = await fetchFarmerSuccessStoryBySlug(slug);
  if (!story) {
    return {
      title: 'Case study not found | FarmCredit',
      description: 'The requested farmer success story could not be found.',
    };
  }

  const title = `${story.farmerName} — farmer success story | FarmCredit`;
  return {
    title,
    description: story.summary,
    openGraph: {
      title,
      description: story.summary,
      type: 'article',
    },
  };
}

/** Pick up to three other case studies, preferring the same project type. */
function getRelatedStories(
  story: FarmerSuccessStory,
  all: FarmerSuccessStory[]
): FarmerSuccessStory[] {
  const others = all.filter((candidate) => candidate.id !== story.id);
  const sameType = others.filter((candidate) => candidate.projectType === story.projectType);
  const rest = others.filter((candidate) => candidate.projectType !== story.projectType);
  return [...sameType, ...rest].slice(0, 3);
}

export default async function FarmerStoryPage({ params }: FarmerStoryPageProps) {
  const { slug } = await params;
  const story = await fetchFarmerSuccessStoryBySlug(slug);
  if (!story) {
    notFound();
  }

  const allStories = await fetchFarmerSuccessStories();
  const relatedStories = getRelatedStories(story, allStories);

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: story.headline,
    description: story.summary,
    datePublished: story.storyDate,
    author: { '@type': 'Person', name: story.farmerName },
    about: story.projectName,
    locationCreated: { '@type': 'Place', name: `${story.region}, ${story.country}` },
  };

  return (
    <main className="min-h-screen bg-background px-4 py-12 text-foreground sm:px-6 lg:px-8">
      <FarmerStoryDetail story={story} relatedStories={relatedStories} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
    </main>
  );
}
