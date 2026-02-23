'use client';

import { useRef, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { buildCategoryUrl } from '@/lib/utils/url';
import { Button } from '@/components/atoms/Button';
import type { CategoryFilterProps } from '@/lib/types/blog';

/**
 * CategoryFilter component displays category buttons for filtering blog posts.
 *
 * Features:
 * - Displays "All" button to clear filters
 * - Shows post count badge for each category
 * - Responsive layout (horizontal scroll on mobile, wrapped on desktop)
 * - Keyboard navigation with arrow keys
 * - ARIA attributes for accessibility
 *
 * Requirements: 2.1, 2.4, 6.5, 7.2, 7.8, 9.2
 */
export function CategoryFilter({ categories, selectedCategory, postCounts }: CategoryFilterProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate total posts for "All" button
  const totalPosts = Object.values(postCounts).reduce((sum, count) => sum + count, 0);

  // Handle keyboard navigation (arrow keys)
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;

    const buttons = Array.from(
      containerRef.current.querySelectorAll<HTMLAnchorElement>('a[role="button"]')
    );

    const currentIndex = buttons.findIndex((button) => button === document.activeElement);

    if (currentIndex === -1) return;

    let nextIndex = currentIndex;

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      nextIndex = currentIndex > 0 ? currentIndex - 1 : buttons.length - 1;
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      nextIndex = currentIndex < buttons.length - 1 ? currentIndex + 1 : 0;
    }

    if (nextIndex !== currentIndex) {
      buttons[nextIndex]?.focus();
    }
  };

  return (
    <nav aria-label="Filter blog posts by category" className="w-full">
      <div
        ref={containerRef}
        onKeyDown={handleKeyDown}
        className={cn(
          'flex gap-2',
          // Mobile: horizontal scroll
          'overflow-x-auto scrollbar-hide flex-nowrap md:overflow-x-visible',
          // Desktop: wrapped layout
          'md:flex-wrap'
        )}
      >
        {/* "All" button */}
        <CategoryButton
          href={buildCategoryUrl(null)}
          label="All"
          count={totalPosts}
          isSelected={selectedCategory === null}
        />

        {/* Category buttons */}
        {categories.map((category) => (
          <CategoryButton
            key={category}
            href={buildCategoryUrl(category)}
            label={category}
            count={postCounts[category] || 0}
            isSelected={selectedCategory === category}
          />
        ))}
      </div>
    </nav>
  );
}

/**
 * Individual category button component
 */
interface CategoryButtonProps {
  href: string;
  label: string;
  count: number;
  isSelected: boolean;
}

function CategoryButton({ href, label, count, isSelected }: CategoryButtonProps) {
  return (
    <Button
      asChild
      stellar={isSelected ? 'primary' : 'primary-outline'}
      className={cn(
        // Ensure minimum touch target size (44x44px) on mobile
        'min-h-[44px] min-w-[44px] px-4 py-2',
        // Prevent text wrapping
        'whitespace-nowrap',
        // Smooth transitions
        'transition-all duration-200'
      )}
    >
      <Link
        href={href}
        role="button"
        aria-pressed={isSelected}
        aria-label={`${label} (${count} ${count === 1 ? 'post' : 'posts'})`}
      >
        <span className="flex items-center gap-2">
          <span>{label}</span>
          <span
            className={cn(
              'inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium',
              isSelected ? 'bg-white/20 text-white' : 'bg-stellar-blue/10 text-stellar-blue'
            )}
            aria-hidden="true"
          >
            {count}
          </span>
        </span>
      </Link>
    </Button>
  );
}
