import Link from 'next/link';

/**
 * Accessible skip link: focusable as the first element on the page, jumps
 * straight to the main content landmark (see app/layout.tsx).
 */
export function SkipLink() {
  return (
    <Link
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground focus:shadow-lg"
    >
      Skip to main content
    </Link>
  );
}

export default SkipLink;
