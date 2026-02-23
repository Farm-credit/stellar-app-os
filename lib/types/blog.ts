/**
 * TypeScript type definitions for blog data models
 *
 * This file contains all type definitions for the blog feature including:
 * - BlogPost: Core blog post data structure
 * - BlogListResponse: API response for blog listing
 * - Component prop interfaces for all blog components
 *
 * All types use strict TypeScript with no 'any' types.
 * Requirements: 8.1, 8.2, 8.3
 */

/**
 * Core blog post data structure
 */
export interface BlogPost {
  /** Unique identifier for the blog post */
  id: string;

  /** URL-friendly slug for the blog post */
  slug: string;

  /** Blog post title */
  title: string;

  /** Short excerpt/summary of the blog post */
  excerpt: string;

  /** Full markdown content of the blog post */
  content: string;

  /** ISO 8601 date string when the post was published */
  publishedAt: string;

  /** ISO 8601 date string when the post was last updated */
  updatedAt: string;

  /** Category of the blog post */
  category: string;

  /** Featured image information */
  featuredImage: {
    /** URL of the featured image */
    url: string;

    /** Alt text for the featured image */
    alt: string;

    /** Width of the image in pixels */
    width: number;

    /** Height of the image in pixels */
    height: number;

    /** Optional base64 blur placeholder for progressive loading */
    blurDataURL?: string;
  };

  /** Author information */
  author: {
    /** Author's name */
    name: string;

    /** Optional URL to author's avatar image */
    avatar?: string;
  };

  /** Whether this post is featured (displayed in hero section) */
  isFeatured: boolean;

  /** SEO metadata */
  seo: {
    /** Optional custom meta title (defaults to post title) */
    metaTitle?: string;

    /** Optional custom meta description (defaults to excerpt) */
    metaDescription?: string;

    /** Optional custom Open Graph image URL */
    ogImage?: string;
  };
}

/**
 * API response structure for blog listing endpoint
 */
export interface BlogListResponse {
  /** Array of blog posts */
  posts: BlogPost[];

  /** Pagination metadata */
  pagination: {
    /** Current page number (1-indexed) */
    currentPage: number;

    /** Total number of pages */
    totalPages: number;

    /** Total number of posts across all pages */
    totalPosts: number;

    /** Number of posts per page */
    postsPerPage: number;
  };

  /** Array of all available categories */
  categories: string[];
}

/**
 * Props for BlogCard component
 */
export interface BlogCardProps {
  /** Blog post data to display */
  post: BlogPost;

  /** Visual variant of the card */
  variant?: 'standard' | 'featured';

  /** Whether to prioritize image loading (for LCP optimization) */
  priority?: boolean;
}

/**
 * Props for CategoryFilter component
 */
export interface CategoryFilterProps {
  /** Array of available categories */
  categories: string[];

  /** Currently selected category (null means "All") */
  selectedCategory: string | null;

  /** Number of posts in each category */
  postCounts: Record<string, number>;
}

/**
 * Props for PaginationControl component
 */
export interface PaginationControlProps {
  /** Current page number (1-indexed) */
  currentPage: number;

  /** Total number of pages */
  totalPages: number;

  /** Base URL for pagination links (preserves category filter) */
  baseUrl: string;
}

/**
 * Props for BlogGrid component
 */
export interface BlogGridProps {
  /** Array of blog posts to display in the grid */
  posts: BlogPost[];
}

/**
 * Props for FeaturedPostHero component
 */
export interface FeaturedPostHeroProps {
  /** Featured blog post to display */
  post: BlogPost;
}

/**
 * Props for BlogPageTemplate component
 */
export interface BlogPageTemplateProps {
  /** Featured post (null if no featured post exists) */
  featuredPost: BlogPost | null;

  /** Array of blog posts to display */
  posts: BlogPost[];

  /** Array of available categories */
  categories: string[];

  /** Currently selected category (null means "All") */
  selectedCategory: string | null;

  /** Current page number (1-indexed) */
  currentPage: number;

  /** Total number of pages */
  totalPages: number;

  /** Number of posts in each category */
  postCounts: Record<string, number>;
}
