/**
 * CMS API client functions for blog feature
 *
 * Supports two modes:
 *  1. **Live CMS** – fetches from CMS_API_URL with Next.js ISR caching.
 *  2. **Mock fallback** – returns local mock data when:
 *       • CMS_API_URL is not set, OR
 *       • BLOG_USE_MOCK_DATA=true is set in the environment, OR
 *       • The CMS API request fails (network / HTTP error).
 *
 * All responses are validated through Zod schemas for runtime type safety.
 *
 * Requirements: 1.1, 8.4, 10.2
 */

import {
  BlogListResponseSchema,
  BlogPostSchema,
  type BlogListResponse,
  type BlogPost,
} from '@/lib/schemas/blog';
import {
  getMockBlogData,
  getMockBlogPostBySlug,
  getAllMockBlogPosts,
} from '@/lib/api/mock/blogData';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true when the API client should bypass the CMS and use mock data.
 *
 * Conditions (any one is sufficient):
 *  - CMS_API_URL is absent or still set to the example placeholder
 *  - BLOG_USE_MOCK_DATA environment variable is "true"
 */
function shouldUseMock(): boolean {
  const apiUrl = process.env.CMS_API_URL;
  if (!apiUrl || apiUrl === 'https://api.example.com') return true;
  if (process.env.BLOG_USE_MOCK_DATA === 'true') return true;
  return false;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetches blog posts from the CMS API (or mock data) with optional filtering
 * and pagination.
 *
 * @param params - Query parameters for filtering and pagination
 * @param params.page     - Page number (1-indexed, optional, default 1)
 * @param params.category - Category filter (optional)
 * @returns Promise resolving to a validated BlogListResponse
 * @throws  Error only when the CMS is reachable but returns bad data
 *
 * Features:
 * - Automatic mock fallback when CMS is unavailable
 * - Next.js ISR caching with 5-minute revalidation (live mode)
 * - Zod schema validation for type safety
 * - Descriptive error messages for debugging
 */
export async function fetchBlogPosts(params: {
  page?: number;
  category?: string;
}): Promise<BlogListResponse> {
  // ── Mock mode ─────────────────────────────────────────────────────────────
  if (shouldUseMock()) {
    if (process.env.NODE_ENV !== 'production') {
      console.info('[Blog API] Using mock data (CMS_API_URL not configured).');
    }
    return getMockBlogData({ page: params.page, category: params.category });
  }

  // ── Live CMS mode ─────────────────────────────────────────────────────────
  const searchParams = new URLSearchParams();

  if (params.page !== undefined) {
    searchParams.set('page', params.page.toString());
  }

  if (params.category !== undefined && params.category !== '') {
    searchParams.set('category', params.category);
  }

  const apiUrl = process.env.CMS_API_URL;
  const url = `${apiUrl}/blog${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;

  try {
    // Fetch with Next.js ISR caching (5-minute revalidation)
    const response = await fetch(url, {
      next: { revalidate: 300 },
    });

    // Handle HTTP errors
    if (!response.ok) {
      throw new Error(
        `CMS API request failed: ${response.status} ${response.statusText} (URL: ${url})`
      );
    }

    // Parse JSON response
    const data = await response.json();

    // Validate response with Zod schema
    try {
      return BlogListResponseSchema.parse(data);
    } catch (validationError) {
      const msg =
        validationError instanceof Error ? validationError.message : 'Unknown validation error';
      throw new Error(`CMS API response validation failed: ${msg}`);
    }
  } catch (error) {
    // ── Network / fetch errors → fall back to mock data ───────────────────
    const isNetworkError =
      error instanceof TypeError && error.message.toLowerCase().includes('fetch');

    if (isNetworkError) {
      console.warn(`[Blog API] Network error contacting ${url}. Falling back to mock data.`);
      return getMockBlogData({ page: params.page, category: params.category });
    }

    // Re-throw validation or unexpected errors
    throw error;
  }
}

/**
 * Fetches an individual blog post by slug.
 */
export async function fetchBlogPostBySlug(slug: string): Promise<BlogPost | null> {
  if (shouldUseMock()) {
    return getMockBlogPostBySlug(slug);
  }

  const apiUrl = process.env.CMS_API_URL!;
  const url = `${apiUrl}/blog/${encodeURIComponent(slug)}`;

  try {
    const response = await fetch(url, {
      next: { revalidate: 300 },
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(
        `CMS API request failed: ${response.status} ${response.statusText} (URL: ${url})`
      );
    }

    const data = await response.json();
    return BlogPostSchema.parse(data);
  } catch (error) {
    const isNetworkError =
      error instanceof TypeError && error.message.toLowerCase().includes('fetch');

    if (isNetworkError) {
      console.warn(
        `[Blog API] Network error contacting ${url}. Falling back to mock data.`
      );
      return getMockBlogPostBySlug(slug);
    }

    throw error;
  }
}

/**
 * Fetches all posts for related-posts and static path generation.
 */
export async function fetchAllBlogPosts(): Promise<BlogPost[]> {
  if (shouldUseMock()) {
    return getAllMockBlogPosts();
  }

  const firstPage = await fetchBlogPosts({ page: 1 });
  if (firstPage.pagination.totalPages <= 1) {
    return firstPage.posts;
  }

  const pagePromises: Array<Promise<BlogListResponse>> = [];
  for (let page = 2; page <= firstPage.pagination.totalPages; page += 1) {
    pagePromises.push(fetchBlogPosts({ page }));
  }

  const otherPages = await Promise.all(pagePromises);
  const combined = [...firstPage.posts, ...otherPages.flatMap((page) => page.posts)];

  const deduped = new Map<string, BlogPost>();
  for (const post of combined) {
    deduped.set(post.slug, post);
  }

  return Array.from(deduped.values());
}
