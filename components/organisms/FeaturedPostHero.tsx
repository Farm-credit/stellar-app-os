/**
 * FeaturedPostHero organism component
 *
 * Renders the featured post hero section at the top of the blog listing page.
 * Uses BlogCard with variant="featured" and priority image loading.
 *
 * Requirements: 4.2, 4.3, 4.5, 6.4
 */

import { BlogCard } from '@/components/molecules/BlogCard';
import type { FeaturedPostHeroProps } from '@/lib/types/blog';

export function FeaturedPostHero({ post }: FeaturedPostHeroProps) {
  return (
    <section aria-label="Featured post" className="w-full">
      {/* Section label */}
      <div className="mb-4 flex items-center gap-3">
        <span
          className="inline-flex items-center gap-1.5 rounded-full bg-stellar-blue/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-stellar-blue"
          aria-hidden="true"
        >
          {/* Star icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z"
              clipRule="evenodd"
            />
          </svg>
          Featured Post
        </span>
        <div className="h-px flex-1 bg-border" aria-hidden="true" />
      </div>

      {/* Featured blog card — horizontal layout on desktop */}
      <BlogCard post={post} variant="featured" priority={true} className="w-full" />
    </section>
  );
}
