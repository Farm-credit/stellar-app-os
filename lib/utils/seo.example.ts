/**
 * Example usage of SEO utility functions
 * This file demonstrates how to use the SEO utilities in Next.js pages
 */

import type { BlogPost } from '@/lib/types/blog';
import {
  generateBlogListingMetadata,
  generateBlogPostMetadata,
  generateBlogPostingSchema,
  generateCanonicalUrl,
} from './seo';

// Example blog post data
const examplePost: BlogPost = {
  id: '1',
  slug: 'understanding-carbon-credits',
  title: 'Understanding Carbon Credits in Modern Agriculture',
  excerpt: 'Learn how carbon credits are transforming sustainable farming practices and creating new revenue streams for farmers.',
  content: '# Full content here...',
  publishedAt: '2024-01-15T10:00:00Z',
  updatedAt: '2024-01-16T14:30:00Z',
  category: 'carbon-credits',
  featuredImage: {
    url: 'https://cdn.farmcredit.com/images/carbon-credits-hero.jpg',
    alt: 'Farmer working in a sustainable field with carbon sequestration practices',
    width: 1200,
    height: 630,
    blurDataURL: 'data:image/jpeg;base64,...',
  },
  author: {
    name: 'Jane Smith',
    avatar: 'https://cdn.farmcredit.com/avatars/jane-smith.jpg',
  },
  isFeatured: true,
  seo: {
    metaTitle: 'Carbon Credits Guide for Farmers | FarmCredit',
    metaDescription: 'Comprehensive guide to understanding and leveraging carbon credits in agriculture. Expert insights from FarmCredit.',
    ogImage: 'https://cdn.farmcredit.com/images/carbon-credits-og.jpg',
  },
};

// Example 1: Generate metadata for blog listing page
// Usage in app/blog/page.tsx:
// export const metadata = generateBlogListingMetadata();
const listingMetadata = generateBlogListingMetadata();
console.log('Blog Listing Metadata:', JSON.stringify(listingMetadata, null, 2));

// Example 2: Generate metadata for individual blog post
// Usage in app/blog/[slug]/page.tsx:
// export async function generateMetadata({ params }) {
//   const post = await fetchBlogPost(params.slug);
//   return generateBlogPostMetadata(post);
// }
const postMetadata = generateBlogPostMetadata(examplePost);
console.log('Blog Post Metadata:', JSON.stringify(postMetadata, null, 2));

// Example 3: Generate JSON-LD structured data
// Usage in app/blog/[slug]/page.tsx:
// const schema = generateBlogPostingSchema(post);
// return (
//   <>
//     <script
//       type="application/ld+json"
//       dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
//     />
//     {/* Rest of page content */}
//   </>
// );
const schema = generateBlogPostingSchema(examplePost);
console.log('BlogPosting Schema:', JSON.stringify(schema, null, 2));

// Example 4: Generate canonical URL
const canonicalUrl = generateCanonicalUrl('/blog/understanding-carbon-credits');
console.log('Canonical URL:', canonicalUrl);

// Example 5: Using in Next.js page component
export async function examplePageComponent() {
  // In a real Next.js page, you would fetch the post data
  const post = examplePost;
  
  // Generate metadata (this would be in generateMetadata function)
  const metadata = generateBlogPostMetadata(post);
  
  // Generate structured data for the page
  const structuredData = generateBlogPostingSchema(post);
  
  return {
    metadata,
    structuredData,
  };
}
