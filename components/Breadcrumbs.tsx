'use client';

import { type JSX, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PiHouseBold, PiCaretRightBold } from 'react-icons/pi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BreadcrumbItem {
  label: string;
  href: string;
  isCurrentPage: boolean;
}

interface BreadcrumbsProps {
  /**
   * Maximum length of label before truncation
   * @default 30
   */
  maxLabelLength?: number;

  /**
   * Custom label overrides for specific routes
   * @example { 'dashboard': 'My Dashboard', 'admin': 'Administration' }
   */
  labelOverrides?: Record<string, string>;

  /**
   * Whether to show the home icon
   * @default true
   */
  showHomeIcon?: boolean;

  /**
   * Whether to hide the breadcrumbs on home page
   * @default false
   */
  hideOnHome?: boolean;

  /**
   * Callback when a breadcrumb is clicked
   */
  onNavigate?: (href: string) => void;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Convert route segment to readable label
 * - Replace hyphens with spaces
 * - Capitalize first letter of each word
 * - Support for numbers and special chars
 */
function formatLabel(segment: string, overrides?: Record<string, string>): string {
  // Check for override first
  if (overrides && overrides[segment]) {
    return overrides[segment];
  }

  return segment
    .replace(/[-_]/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

/**
 * Truncate label with ellipsis
 */
function truncateLabel(label: string, maxLength: number): string {
  if (label.length <= maxLength) {
    return label;
  }
  return label.substring(0, maxLength) + '…';
}

/**
 * Check if a segment looks like a dynamic route parameter (UUID, ID, etc.)
 */
function isDynamicSegment(segment: string): boolean {
  // Common ID patterns: UUIDs, numeric IDs, slugs with hyphens
  const idPattern = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+)$/i;
  return idPattern.test(segment);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Breadcrumbs
 *
 * Auto-generates breadcrumb navigation from the current route.
 *
 * Features:
 * - Auto-generates from route pathname
 * - Clickable segments with Next.js Link
 * - Home icon at root
 * - Truncates long names with tooltips
 * - Works with nested routes and dynamic segments
 * - Responsive design
 * - WCAG 2.1 AA accessible
 *
 * Accessibility:
 * - Uses nav element with aria-label
 * - Current page marked with aria-current="page"
 * - Provides title attributes for truncated text
 * - Semantic structure with proper link elements
 * - Separator icons are aria-hidden
 *
 * Example usage:
 * - On /dashboard → Home > Dashboard
 * - On /projects/123 → Home > Projects > [Project Name]
 * - On /admin/users/456/edit → Home > Admin > Users > [User] > Edit
 */
export function Breadcrumbs({
  maxLabelLength = 30,
  labelOverrides = {},
  showHomeIcon = true,
  hideOnHome = false,
  onNavigate,
}: BreadcrumbsProps): JSX.Element | null {
  const pathname = usePathname();

  /**
   * Generate breadcrumb items from pathname
   */
  const breadcrumbs = useMemo((): BreadcrumbItem[] => {
    // Handle home page
    if (pathname === '/') {
      return [];
    }

    // Split pathname into segments
    const segments = pathname.split('/').filter((segment) => segment.length > 0);

    const items: BreadcrumbItem[] = [];

    // Generate breadcrumb for each segment
    segments.forEach((segment, index) => {
      const href = '/' + segments.slice(0, index + 1).join('/');
      const isCurrentPage = index === segments.length - 1;

      // Skip dynamic segments (IDs, UUIDs) but use parent label if available
      if (isDynamicSegment(segment)) {
        return;
      }

      const label = formatLabel(segment, labelOverrides);

      items.push({
        label,
        href,
        isCurrentPage,
      });
    });

    return items;
  }, [pathname, labelOverrides]);

  // Hide on home page if enabled
  if (hideOnHome && pathname === '/') {
    return null;
  }

  // Don't render if no breadcrumbs (empty home page)
  if (breadcrumbs.length === 0 && pathname !== '/') {
    return null;
  }

  return (
    <nav className="mx-auto max-w-6xl px-4 py-3 sm:px-6 lg:px-8" aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-sm sm:gap-2">
        {/* Home Link */}
        <li>
          <Link
            href="/"
            className="flex items-center gap-1 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1"
            onClick={() => onNavigate?.('/')}
            aria-label="Home"
          >
            {showHomeIcon && <PiHouseBold className="h-4 w-4 flex-shrink-0" aria-hidden="true" />}
            <span className="hidden sm:inline">Home</span>
            <span className="sm:hidden">Home</span>
          </Link>
        </li>

        {/* Breadcrumb Items */}
        {breadcrumbs.length > 0 && (
          <>
            {breadcrumbs.map((item) => (
              <li key={item.href} className="flex items-center gap-1 sm:gap-2">
                {/* Separator */}
                <PiCaretRightBold
                  className="h-4 w-4 text-slate-400 dark:text-slate-600 flex-shrink-0"
                  aria-hidden="true"
                />

                {/* Link or Current Page */}
                {item.isCurrentPage ? (
                  // Current Page - Not a link
                  <span
                    className="text-slate-900 dark:text-white font-medium"
                    aria-current="page"
                    title={item.label.length > maxLabelLength ? item.label : undefined}
                  >
                    {truncateLabel(item.label, maxLabelLength)}
                  </span>
                ) : (
                  // Parent Pages - Links
                  <Link
                    href={item.href}
                    className="text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-2 py-1"
                    onClick={() => onNavigate?.(item.href)}
                    title={item.label.length > maxLabelLength ? item.label : undefined}
                  >
                    {truncateLabel(item.label, maxLabelLength)}
                  </Link>
                )}
              </li>
            ))}
          </>
        )}
      </ol>
    </nav>
  );
}

export default Breadcrumbs;
