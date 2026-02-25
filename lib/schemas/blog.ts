/**
 * Zod validation schemas for blog data models
 *
 * This file contains runtime validation schemas using Zod for:
 * - BlogPost: Core blog post data structure validation
 * - BlogListResponse: API response validation for blog listing
 *
 * These schemas provide runtime type safety for external data sources (CMS API)
 * and export inferred TypeScript types.
 *
 * Requirements: 8.4, 8.6
 */

import { z } from 'zod';

/**
 * Zod schema for blog post featured image
 */
const FeaturedImageSchema = z.object({
  url: z.string().url('Featured image URL must be a valid URL'),
  alt: z.string().min(1, 'Featured image alt text is required'),
  width: z.number().int().positive('Image width must be a positive integer'),
  height: z.number().int().positive('Image height must be a positive integer'),
  blurDataURL: z.string().optional(),
});

/**
 * Zod schema for blog post author
 */
const AuthorSchema = z.object({
  name: z.string().min(1, 'Author name is required'),
  avatar: z.string().url('Author avatar must be a valid URL').optional(),
});

/**
 * Zod schema for blog post SEO metadata
 */
const SeoSchema = z.object({
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  ogImage: z.string().url('OG image must be a valid URL').optional(),
});

/**
 * Zod schema for blog post
 * Validates all required fields with appropriate constraints
 */
export const BlogPostSchema = z.object({
  id: z.string().min(1, 'Blog post ID is required'),
  slug: z.string().min(1, 'Blog post slug is required'),
  title: z.string().min(1, 'Blog post title is required'),
  excerpt: z.string().min(1, 'Blog post excerpt is required'),
  content: z.string(),
  publishedAt: z.string().datetime('Published date must be in ISO 8601 format'),
  updatedAt: z.string().datetime('Updated date must be in ISO 8601 format'),
  category: z.string().min(1, 'Blog post category is required'),
  featuredImage: FeaturedImageSchema,
  author: AuthorSchema,
  isFeatured: z.boolean(),
  seo: SeoSchema,
});

/**
 * Zod schema for pagination metadata
 */
const PaginationSchema = z.object({
  currentPage: z.number().int().positive('Current page must be a positive integer'),
  totalPages: z.number().int().positive('Total pages must be a positive integer'),
  totalPosts: z.number().int().nonnegative('Total posts must be a non-negative integer'),
  postsPerPage: z.number().int().positive('Posts per page must be a positive integer'),
});

/**
 * Zod schema for blog list API response
 * Validates the complete response structure from the CMS API
 */
export const BlogListResponseSchema = z.object({
  posts: z.array(BlogPostSchema),
  pagination: PaginationSchema,
  categories: z.array(z.string()),
});

/**
 * Inferred TypeScript types from Zod schemas
 * These types are guaranteed to match the runtime validation schemas
 */
export type BlogPost = z.infer<typeof BlogPostSchema>;
export type BlogListResponse = z.infer<typeof BlogListResponseSchema>;
export type FeaturedImage = z.infer<typeof FeaturedImageSchema>;
export type Author = z.infer<typeof AuthorSchema>;
export type Seo = z.infer<typeof SeoSchema>;
export type Pagination = z.infer<typeof PaginationSchema>;
