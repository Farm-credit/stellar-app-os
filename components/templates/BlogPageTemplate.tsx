'use client';

/**
 * BlogPageTemplate template component
 *
 * Composes FeaturedPostHero, CategoryFilter, BlogGrid, and PaginationControl
 * into the full blog listing page layout.
 *
 * Requirements: 1.2, 2.1, 3.1, 4.2
 */

import { FeaturedPostHero } from '@/components/organisms/FeaturedPostHero';
import { CategoryFilter } from '@/components/molecules/CategoryFilter';
import { BlogGrid } from '@/components/organisms/BlogGrid';
import { PaginationControl } from '@/components/molecules/PaginationControl';
import { useAppTranslation } from '@/hooks/useTranslation';
import type { BlogPageTemplateProps } from '@/lib/types/blog';
import { JSX } from 'react';

export function BlogPageTemplate({
  featuredPost,
  posts,
  categories,
  selectedCategory,
  currentPage,
  totalPages,
  postCounts,
}: BlogPageTemplateProps): JSX.Element {
  const { t } = useAppTranslation();

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8 py-12">
      {/* Page header */}
      <header className="mb-12 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">
          {t('blog.featuredBlogTitle')}
        </h1>
        <p className="max-w-2xl mx-auto text-lg text-muted-foreground">
          {t('blog.pageSubtitle')}
        </p>
      </header>

      {/* Featured post hero — only renders when a featured post exists */}
      {featuredPost && (
        <section className="mb-12">
          <FeaturedPostHero post={featuredPost} />
        </section>
      )}

      {/* Category filter */}
      {categories.length > 0 && (
        <section className="mb-8" aria-label={t('blog.categoryFiltersLabel')}>
          <CategoryFilter
            categories={categories}
            selectedCategory={selectedCategory}
            postCounts={postCounts}
          />
        </section>
      )}

      {/* Blog grid */}
      <section className="mb-12">
        <BlogGrid posts={posts} />
      </section>

      {/* Pagination */}
      {totalPages > 1 && (
        <PaginationControl
          currentPage={currentPage}
          totalPages={totalPages}
          currentCategory={selectedCategory}
        />
      )}
    </div>
  );
}