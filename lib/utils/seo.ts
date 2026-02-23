/**
 * SEO utility functions for blog feature
 *
 * This file contains functions for generating SEO metadata including:
 * - Meta tags (title, description)
 * - Open Graph tags
 * - Twitter Card tags
 * - JSON-LD structured data (BlogPosting schema)
 * - Canonical URLs
 *
 * All functions return objects compatible with Next.js 15 Metadata API.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.6
 */

import type { Metadata } from 'next';
import type { BlogPost } from '@/lib/types/blog';

/**
 * Generates canonical URL from relative path
 * Uses NEXT_PUBLIC_SITE_URL environment variable
 *
 * @param path - Relative path (e.g., "/blog" or "/blog/my-post")
 * @returns Absolute canonical URL
 *
 * Requirements: 5.6
 */
export function generateCanonicalUrl(path: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://farmcredit.com';

  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  // Remove trailing slash from site URL if present
  const normalizedSiteUrl = siteUrl.endsWith('/') ? siteUrl.slice(0, -1) : siteUrl;

  return `${normalizedSiteUrl}${normalizedPath}`;
}

/**
 * Generates Next.js Metadata object for the blog listing page
 * Includes title, description, Open Graph tags, and canonical URL
 *
 * @returns Next.js Metadata object for blog listing page
 *
 * Requirements: 5.1, 5.2, 5.6
 */
export function generateBlogListingMetadata(): Metadata {
  const title = 'Blog | FarmCredit - Carbon Credits & Sustainable Farming';
  const description =
    "Explore insights on carbon credits, sustainable farming practices, climate technology, and agricultural policy. Stay informed with FarmCredit's expert perspectives.";
  const canonicalUrl = generateCanonicalUrl('/blog');

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: 'FarmCredit',
      type: 'website',
      locale: 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

/**
 * Generates Next.js Metadata object for individual blog post pages
 * Includes custom meta tags from post.seo, Open Graph tags, and Twitter Cards
 *
 * @param post - Blog post data
 * @returns Next.js Metadata object for blog post page
 *
 * Requirements: 5.2, 5.3, 5.6
 */
export function generateBlogPostMetadata(post: BlogPost): Metadata {
  // Use custom SEO fields if provided, otherwise fall back to post data
  const title = post.seo.metaTitle || post.title;
  const description = post.seo.metaDescription || post.excerpt;
  const ogImage = post.seo.ogImage || post.featuredImage.url;
  const canonicalUrl = generateCanonicalUrl(`/blog/${post.slug}`);

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: 'FarmCredit',
      type: 'article',
      locale: 'en_US',
      images: [
        {
          url: ogImage,
          width: post.featuredImage.width,
          height: post.featuredImage.height,
          alt: post.featuredImage.alt,
        },
      ],
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      authors: [post.author.name],
      tags: [post.category],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  };
}

/**
 * Generates JSON-LD structured data for BlogPosting schema
 * Follows schema.org/BlogPosting specification
 *
 * @param post - Blog post data
 * @returns JSON-LD structured data object
 *
 * Requirements: 5.3
 */
export function generateBlogPostingSchema(post: BlogPost): Record<string, unknown> {
  const canonicalUrl = generateCanonicalUrl(`/blog/${post.slug}`);

  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    image: {
      '@type': 'ImageObject',
      url: post.featuredImage.url,
      width: post.featuredImage.width,
      height: post.featuredImage.height,
      caption: post.featuredImage.alt,
    },
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    author: {
      '@type': 'Person',
      name: post.author.name,
      ...(post.author.avatar && { image: post.author.avatar }),
    },
    publisher: {
      '@type': 'Organization',
      name: 'FarmCredit',
      logo: {
        '@type': 'ImageObject',
        url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://farmcredit.com'}/logo.png`,
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': canonicalUrl,
    },
    url: canonicalUrl,
    articleSection: post.category,
  };
}
