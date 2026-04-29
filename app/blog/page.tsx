/**
 * Blog listing page — Next.js App Router page with Suspense boundary
 *
 * - Reads searchParams for category and page
 * - Fetches blog posts from the CMS API (SSR with 5-minute revalidation)
 * - Derives featured post and per-category post counts
 * - Exports generateMetadata for SEO
 * - Uses Suspense with ProjectCardGridSkeleton for loading state
 *
 * Requirements: 1.1, 2.6, 3.8, 5.1, 5.2
 */

import type { Metadata } from 'next';
import { Suspense } from 'react';
import { fetchBlogPosts } from '@/lib/api/blog';
import { generateBlogListingMetadata } from '@/lib/utils/seo';
import { BlogPageTemplate } from '@/components/templates/BlogPageTemplate';
import { ProjectCardGridSkeleton } from '@/components/molecules/SkeletonLoaders';
import type { BlogPost } from '@/lib/types/blog';

export const dynamic = 'force-dynamic';

// ── SEO metadata ──────────────────────────────────────────────────────────────

export function generateMetadata(): Metadata {
  return generateBlogListingMetadata();
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface BlogPageProps {
  searchParams: Promise<{
    category?: string;
    page?: string;
  }>;
}

// ── Blog Content Component ────────────────────────────────────────────────────

async function BlogContent({
  selectedCategory,
  currentPage,
}: {
  selectedCategory: string | null;
  currentPage: number;
}) {
  // Fetch posts from CMS API (cached for 5 minutes via Next.js fetch caching)
  const data = await fetchBlogPosts({
    page: currentPage,
    category: selectedCategory ?? undefined,
  });

  // Derive featured post: first post marked isFeatured, or null
  const featuredPost: BlogPost | null = data.posts.find((post) => post.isFeatured) ?? null;

  // Derive per-category post counts from the categories array
  const postCounts: Record<string, number> = {};
  for (const category of data.categories) {
    postCounts[category] = data.posts.filter((post) => post.category === category).length;
  }

  return (
    <BlogPageTemplate
      featuredPost={featuredPost}
      posts={data.posts}
      categories={data.categories}
      selectedCategory={selectedCategory}
      currentPage={data.pagination.currentPage}
      totalPages={data.pagination.totalPages}
      postCounts={postCounts}
    />
  );
}

// ── Page component ────────────────────────────────────────────────────────────

export default async function BlogPage({ searchParams }: BlogPageProps) {
  // Await searchParams (required in Next.js 15+)
  const params = await searchParams;

  const selectedCategory = params.category ?? null;
  const currentPage = Math.max(1, parseInt(params.page ?? '1', 10));

  return (
    <main id="main-content" aria-label="Blog listing">
      <Suspense fallback={<ProjectCardGridSkeleton count={6} />}>
        <BlogContent selectedCategory={selectedCategory} currentPage={currentPage} />
      </Suspense>
    </main>
  );
}
