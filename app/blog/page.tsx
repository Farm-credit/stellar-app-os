/**
 * Blog listing page — Next.js App Router server component
 *
 * - Reads searchParams for category and page
 * - Fetches blog posts from the CMS API (SSR with 5-minute revalidation)
 * - Derives featured post and per-category post counts
 * - Exports generateMetadata for SEO
 *
 * Requirements: 1.1, 2.6, 3.8, 5.1, 5.2
 */

import type { Metadata } from 'next';
import { fetchBlogPosts } from '@/lib/api/blog';
import { generateBlogListingMetadata } from '@/lib/utils/seo';
import { BlogPageTemplate } from '@/components/templates/BlogPageTemplate';
import type { BlogPost } from '@/lib/types/blog';

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

// ── Page component ────────────────────────────────────────────────────────────

export default async function BlogPage({ searchParams }: BlogPageProps) {
  // Await searchParams (required in Next.js 15+)
  const params = await searchParams;

  const selectedCategory = params.category ?? null;
  const currentPage = Math.max(1, parseInt(params.page ?? '1', 10));

  // Fetch posts from CMS API (cached for 5 minutes via Next.js fetch caching)
  const data = await fetchBlogPosts({
    page: currentPage,
    category: selectedCategory ?? undefined,
  });

  // Derive featured post: first post marked isFeatured, or null
  const featuredPost: BlogPost | null = data.posts.find((post) => post.isFeatured) ?? null;

  // Derive per-category post counts from the categories array
  // The API returns all categories; we compute counts from the current page's posts
  // (in a real API these would come from the server, but we derive them client-side here)
  const postCounts: Record<string, number> = {};
  for (const category of data.categories) {
    postCounts[category] = data.posts.filter((post) => post.category === category).length;
  }

  return (
    <main id="main-content" aria-label="Blog listing">
      <BlogPageTemplate
        featuredPost={featuredPost}
        posts={data.posts}
        categories={data.categories}
        selectedCategory={selectedCategory}
        currentPage={data.pagination.currentPage}
        totalPages={data.pagination.totalPages}
        postCounts={postCounts}
      />
    </main>
  );
}
