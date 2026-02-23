/**
 * BlogGrid organism component
 *
 * Renders a responsive CSS Grid of BlogCard components.
 * Includes an empty state for zero posts and an aria-live region
 * so screen readers announce content changes on filter/pagination.
 *
 * Requirements: 1.2, 1.6, 6.1, 6.2, 6.3, 7.6, 10.1, 10.3
 */

import { BlogCard } from '@/components/molecules/BlogCard';
import type { BlogGridProps } from '@/lib/types/blog';

export function BlogGrid({ posts }: BlogGridProps) {
  return (
    <section aria-label="Blog posts" aria-live="polite" aria-atomic="false">
      {posts.length === 0 ? (
        <EmptyState />
      ) : (
        <ul
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 list-none p-0"
          role="list"
        >
          {posts.map((post) => (
            <li key={post.id}>
              <BlogCard post={post} variant="standard" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Empty state displayed when no posts match the current filters.
 */
function EmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center py-24 text-center"
      role="status"
      aria-live="polite"
    >
      {/* Decorative icon */}
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-stellar-blue/10">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-10 w-10 text-stellar-blue"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .513v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
          />
        </svg>
      </div>

      <h2 className="mb-2 text-2xl font-semibold text-foreground">No posts found</h2>
      <p className="max-w-sm text-muted-foreground">
        There are no blog posts matching your current filters. Try selecting a different category or
        clearing your filters.
      </p>
    </div>
  );
}
