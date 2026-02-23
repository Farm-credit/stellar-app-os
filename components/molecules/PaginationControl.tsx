'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { Button } from '@/components/atoms/Button';
import { buildPaginationUrl } from '@/lib/utils/url';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Props for PaginationControl component
 */
export interface PaginationControlProps {
  /** Current page number (1-indexed) */
  currentPage: number;

  /** Total number of pages */
  totalPages: number;

  /** Current category filter to preserve in URLs (optional) */
  currentCategory?: string | null;
}

/**
 * PaginationControl molecule component
 *
 * Displays pagination controls for navigating through blog posts.
 * Features:
 * - Previous/Next buttons with disabled states
 * - Page numbers with ellipsis for large ranges
 * - Responsive display (compact on mobile, full on desktop)
 * - Scroll-to-top behavior on page change
 * - Preserves category filter in URLs
 *
 * Requirements: 3.2, 3.4, 3.5, 3.6, 6.6, 7.2
 */
export function PaginationControl({
  currentPage,
  totalPages,
  currentCategory,
}: PaginationControlProps) {
  // Scroll to top when page changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentPage]);

  // Don't render if only one page
  if (totalPages <= 1) {
    return null;
  }

  const isPrevDisabled = currentPage === 1;
  const isNextDisabled = currentPage === totalPages;

  /**
   * Generates array of page numbers to display with ellipsis
   * For large page counts (> 7 pages), shows:
   * - First page
   * - Last page
   * - Current page
   * - 2 pages before and after current
   * - "..." for gaps
   * Example: 1 ... 5 6 7 ... 20
   */
  const getPageNumbers = (): (number | 'ellipsis')[] => {
    // If 7 or fewer pages, show all
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages: (number | 'ellipsis')[] = [];

    // Always show first page
    pages.push(1);

    // Calculate range around current page
    const startPage = Math.max(2, currentPage - 2);
    const endPage = Math.min(totalPages - 1, currentPage + 2);

    // Add ellipsis after first page if needed
    if (startPage > 2) {
      pages.push('ellipsis');
    }

    // Add pages around current page
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    // Add ellipsis before last page if needed
    if (endPage < totalPages - 1) {
      pages.push('ellipsis');
    }

    // Always show last page
    pages.push(totalPages);

    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <nav
      role="navigation"
      aria-label="Pagination navigation"
      className="flex items-center justify-center gap-2 mt-8"
    >
      {/* Previous button */}
      <Button
        asChild={!isPrevDisabled}
        disabled={isPrevDisabled}
        variant="outline"
        size="icon"
        aria-label="Go to previous page"
        className={cn('h-10 w-10', isPrevDisabled && 'cursor-not-allowed opacity-50')}
      >
        {isPrevDisabled ? (
          <span>
            <ChevronLeft className="h-4 w-4" />
          </span>
        ) : (
          <Link
            href={buildPaginationUrl(currentPage - 1, currentCategory)}
            aria-label={`Go to page ${currentPage - 1}`}
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
        )}
      </Button>

      {/* Page numbers - hidden on mobile, shown on desktop */}
      <div className="hidden md:flex items-center gap-2">
        {pageNumbers.map((page, index) => {
          if (page === 'ellipsis') {
            return (
              <span
                key={`ellipsis-${index}`}
                className="px-2 text-muted-foreground"
                aria-hidden="true"
              >
                ...
              </span>
            );
          }

          const isCurrentPage = page === currentPage;

          return (
            <Button
              key={page}
              asChild={!isCurrentPage}
              variant={isCurrentPage ? 'default' : 'outline'}
              size="icon"
              aria-label={`Go to page ${page}`}
              aria-current={isCurrentPage ? 'page' : undefined}
              className={cn(
                'h-10 w-10',
                isCurrentPage && 'bg-stellar-blue hover:bg-stellar-blue/90'
              )}
            >
              {isCurrentPage ? (
                <span>{page}</span>
              ) : (
                <Link href={buildPaginationUrl(page, currentCategory)}>{page}</Link>
              )}
            </Button>
          );
        })}
      </div>

      {/* Current page indicator - shown on mobile only */}
      <div className="md:hidden flex items-center px-4 text-sm text-muted-foreground">
        <span aria-live="polite" aria-atomic="true">
          Page {currentPage} of {totalPages}
        </span>
      </div>

      {/* Next button */}
      <Button
        asChild={!isNextDisabled}
        disabled={isNextDisabled}
        variant="outline"
        size="icon"
        aria-label="Go to next page"
        className={cn('h-10 w-10', isNextDisabled && 'cursor-not-allowed opacity-50')}
      >
        {isNextDisabled ? (
          <span>
            <ChevronRight className="h-4 w-4" />
          </span>
        ) : (
          <Link
            href={buildPaginationUrl(currentPage + 1, currentCategory)}
            aria-label={`Go to page ${currentPage + 1}`}
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </Button>
    </nav>
  );
}
