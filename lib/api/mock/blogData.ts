/**
 * Mock blog data for development and API fallback
 *
 * Used when:
 *  - CMS_API_URL is not set in the environment (.env.local)
 *  - The CMS API is unreachable (network error)
 *  - NODE_ENV === 'development' and BLOG_USE_MOCK_DATA === 'true'
 *
 * Data shape must satisfy BlogListResponse / BlogListResponseSchema.
 */

import type { BlogListResponse } from '@/lib/types/blog';

export const MOCK_CATEGORIES = [
  'Crop Finance',
  'Livestock',
  'Agri-Tech',
  'Weather & Risk',
  'Success Stories',
];

const MARKDOWN_BY_CATEGORY: Record<string, string> = {
  'Crop Finance': `## Why timing matters

Accessing credit before planting usually improves rates and repayment flexibility.

### Quick checklist

- Updated farm records
- Input cost estimates
- Seasonal cashflow plan

> Strong documentation lowers lending risk.

![Farmer checking seedlings](https://images.unsplash.com/photo-1472396961693-142e6e269027?w=1200&h=700&fit=crop)

Learn more from [our financing team](/credits/purchase).`,
  Livestock: `## Building lender confidence

Lenders look for consistent herd data, feed cost planning, and veterinary records.

### What to prepare

1. Current livestock inventory
2. Revenue history for the last 12 months
3. Disease prevention plan

\`\`\`
Tip: keep digital records to speed up underwriting.
\`\`\`

![Cattle at sunrise](https://images.unsplash.com/photo-1516467508483-a7212febe31a?w=1200&h=700&fit=crop)`,
  'Agri-Tech': `## Technology can improve margins

Sensors, drones, and automation reduce waste and increase yield predictability.

### Adoption model

- Start with one high-impact workflow
- Track baseline performance for 4-8 weeks
- Scale based on measurable ROI

![Drone flying over crops](https://images.unsplash.com/photo-1523741543316-beb7fc7023d8?w=1200&h=700&fit=crop)

Use [this comparison tool](/credits/compare) before applying for a tech loan.`,
  'Weather & Risk': `## Risk planning for uncertain seasons

Weather-index products can protect farm cashflow during drought or flooding.

### Core protections

- Crop insurance linked to loan repayment
- Diversified planting cycles
- Emergency reserve targets

![Rain over farmland](https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&h=700&fit=crop)`,
  'Success Stories': `## Practical growth story

A phased credit model helped this farm reinvest in irrigation and quality inputs.

### Results after 18 months

- Yield increased by 43%
- Input costs reduced by 16%
- Better price negotiation at harvest

![Farmer in field](https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=1200&h=700&fit=crop)

Read more stories on the [FarmCredit blog](/blog).`,
};

export const MOCK_BLOG_DATA: BlogListResponse = {
  categories: MOCK_CATEGORIES,
  pagination: {
    currentPage: 1,
    totalPages: 3,
    totalPosts: 9,
    postsPerPage: 3,
  },
  posts: [
    {
      id: 'post-1',
      slug: 'how-to-access-farm-credit-2025',
      title: 'How to Access Farm Credit in 2025: A Complete Guide',
      excerpt:
        'Navigating agricultural financing has never been easier. Here is everything farmers need to know about eligibility, application, and repayment.',
      content: MARKDOWN_BY_CATEGORY['Crop Finance'],
      publishedAt: '2026-02-10T08:00:00.000Z',
      updatedAt: '2026-02-15T10:30:00.000Z',
      category: 'Crop Finance',
      isFeatured: true,
      featuredImage: {
        url: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&h=630&fit=crop',
        alt: 'Aerial view of green farmland',
        width: 1200,
        height: 630,
      },
      author: {
        name: 'Amara Osei',
        avatar:
          'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&face',
      },
      seo: {
        metaTitle: 'How to Access Farm Credit in 2025 | FarmCredit',
        metaDescription:
          'A complete guide to agricultural financing: eligibility, how to apply, and repayment options for 2025.',
      },
    },
    {
      id: 'post-2',
      slug: 'livestock-financing-best-practices',
      title: 'Livestock Financing: Best Practices for Small-Scale Farmers',
      excerpt:
        'Small-scale livestock farmers can access credit more confidently by understanding key financing principles and documentation requirements.',
      content: MARKDOWN_BY_CATEGORY['Livestock'],
      publishedAt: '2026-02-05T09:00:00.000Z',
      updatedAt: '2026-02-05T09:00:00.000Z',
      category: 'Livestock',
      isFeatured: false,
      featuredImage: {
        url: 'https://images.unsplash.com/photo-1548550023-2bdb3c5beed7?w=800&h=450&fit=crop',
        alt: 'Cattle grazing on open pasture',
        width: 800,
        height: 450,
      },
      author: {
        name: 'Kweku Asante',
      },
      seo: {},
    },
    {
      id: 'post-3',
      slug: 'precision-agriculture-tech-loans',
      title: 'Precision Agriculture & Tech Loans: What Farmers Need to Know',
      excerpt:
        'Drones, soil sensors, and smart irrigation are transforming farming. Learn how technology loans can help you adopt these tools.',
      content: MARKDOWN_BY_CATEGORY['Agri-Tech'],
      publishedAt: '2026-01-28T07:00:00.000Z',
      updatedAt: '2026-01-29T14:00:00.000Z',
      category: 'Agri-Tech',
      isFeatured: false,
      featuredImage: {
        url: 'https://images.unsplash.com/photo-1586771107445-d3ca888129ff?w=800&h=450&fit=crop',
        alt: 'Agricultural drone flying over crops',
        width: 800,
        height: 450,
      },
      author: {
        name: 'Efua Mensah',
      },
      seo: {},
    },
    {
      id: 'post-4',
      slug: 'managing-weather-risk-insurance',
      title: 'Managing Weather Risk: Crop Insurance Explained',
      excerpt:
        'Unpredictable rains and droughts can wipe out an entire season. Crop insurance tied to your credit plan is your safety net.',
      content: MARKDOWN_BY_CATEGORY['Weather & Risk'],
      publishedAt: '2026-01-20T08:00:00.000Z',
      updatedAt: '2026-01-20T08:00:00.000Z',
      category: 'Weather & Risk',
      isFeatured: false,
      featuredImage: {
        url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=450&fit=crop',
        alt: 'Storm clouds gathering over farmland',
        width: 800,
        height: 450,
      },
      author: {
        name: 'Yaw Darko',
      },
      seo: {},
    },
    {
      id: 'post-5',
      slug: 'farmer-success-story-kojo-farms',
      title: "From 2 Acres to 20: Kojo's Journey with FarmCredit",
      excerpt:
        'How one determined farmer used a structured credit plan to scale his maize farm tenfold in under four years.',
      content: MARKDOWN_BY_CATEGORY['Success Stories'],
      publishedAt: '2026-01-12T10:00:00.000Z',
      updatedAt: '2026-01-13T08:00:00.000Z',
      category: 'Success Stories',
      isFeatured: false,
      featuredImage: {
        url: 'https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=800&h=450&fit=crop',
        alt: 'Farmer standing proudly in his maize field',
        width: 800,
        height: 450,
      },
      author: {
        name: 'Ama Boateng',
      },
      seo: {},
    },
    {
      id: 'post-6',
      slug: 'seasonal-credit-planning-rainy-season',
      title: 'Seasonal Credit Planning: Preparing for the Rainy Season',
      excerpt:
        'Timing your credit application to align with planting seasons is one of the smartest financial moves a farmer can make.',
      content: MARKDOWN_BY_CATEGORY['Crop Finance'],
      publishedAt: '2026-01-05T07:30:00.000Z',
      updatedAt: '2026-01-05T07:30:00.000Z',
      category: 'Crop Finance',
      isFeatured: false,
      featuredImage: {
        url: 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800&h=450&fit=crop',
        alt: 'Farmer planting seedlings in moist soil',
        width: 800,
        height: 450,
      },
      author: {
        name: 'Amara Osei',
      },
      seo: {},
    },
    {
      id: 'post-7',
      slug: 'poultry-farming-loan-checklist',
      title: 'Poultry Farming Loan Checklist: What to Prepare',
      excerpt:
      
      content: MARKDOWN_BY_CATEGORY['Livestock'],
        "Before you walk into a lender's office for a poultry loan, make sure you have these 10 documents and metrics ready.",
   
      publishedAt: '2025-12-28T09:00:00.000Z',
      updatedAt: '2025-12-28T09:00:00.000Z',
      category: 'Livestock',
      isFeatured: false,
      featuredImage: {
        url: 'https://images.unsplash.com/photo-1548550023-2bdb3c5beed7?w=800&h=450&fit=crop',
        alt: 'Poultry farm interior',
        width: 800,
        height: 450,
      },
      author: {
        name: 'Kweku Asante',
      },
      seo: {},
    },
    {
      id: 'post-8',
      slug: 'smart-irrigation-roi',
      title: 'Smart Irrigation ROI: Is the Investment Worth It?',
      excerpt:
        'A breakdown of upfront costs, water savings, and yield improvements across three different farm sizes.',
      content: MARKDOWN_BY_CATEGORY['Agri-Tech'],
      publishedAt: '2025-12-18T08:00:00.000Z',
      updatedAt: '2025-12-18T08:00:00.000Z',
      category: 'Agri-Tech',
      isFeatured: false,
      featuredImage: {
        url: 'https://images.unsplash.com/photo-1586771107445-d3ca888129ff?w=800&h=450&fit=crop',
        alt: 'Smart irrigation system in a vegetable field',
        width: 800,
        height: 450,
      },
      author: {
        name: 'Efua Mensah',
      },
      seo: {},
    },
    {
      id: 'post-9',
      slug: 'adwoa-cocoa-success-story',
      title: "Adwoa's Cocoa Farm: Tripling Yield with Structured Finance",
      excerpt:
        'A cocoa farmer in the Ashanti region shares how a phased credit plan allowed her to renovate aging trees and triple output.',
      content: MARKDOWN_BY_CATEGORY['Success Stories'],
      publishedAt: '2025-12-05T10:00:00.000Z',
      updatedAt: '2025-12-05T10:00:00.000Z',
      category: 'Success Stories',
      isFeatured: false,
      featuredImage: {
        url: 'https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=800&h=450&fit=crop',
        alt: 'Cocoa pods on tree branch',
        width: 800,
        height: 450,
      },
      author: {
        name: 'Ama Boateng',
      },
      seo: {},
    },
  ],
};

/**
 * Returns a paginated + optionally filtered slice of the mock data.
 * Mirrors the filtering/pagination logic a real API would perform.
 */
export function getMockBlogData(params: {
  page?: number;
  category?: string;
  postsPerPage?: number;
}): BlogListResponse {
  const { page = 1, category, postsPerPage = 6 } = params;

  // Filter by category if provided
  const filtered = category
    ? MOCK_BLOG_DATA.posts.filter((p) => p.category === category)
    : MOCK_BLOG_DATA.posts;

  const totalPosts = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalPosts / postsPerPage));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * postsPerPage;
  const posts = filtered.slice(start, start + postsPerPage);

  return {
    posts,
    categories: MOCK_CATEGORIES,
    pagination: {
      currentPage: safePage,
      totalPages,
      totalPosts,
      postsPerPage,
    },
  };
}

export function getAllMockBlogPosts() {
  return [...MOCK_BLOG_DATA.posts];
}

export function getMockBlogPostBySlug(slug: string) {
  return MOCK_BLOG_DATA.posts.find((post) => post.slug === slug) ?? null;
}
