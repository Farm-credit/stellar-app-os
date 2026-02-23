'use client';

/**
 * Blog page error boundary — Next.js App Router error component
 *
 * Catches unhandled errors in the blog route segment and displays a
 * user-friendly error message with a retry button.
 *
 * Requirements: 1.4, 10.2, 10.6
 */

import { useEffect } from 'react';
import { Button } from '@/components/atoms/Button';

interface BlogErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function BlogError({ error, reset }: BlogErrorProps) {
  useEffect(() => {
    // Log error to console for debugging; in production this would go to an
    // error tracking service (e.g. Sentry)
    console.error('[Blog] Unhandled error:', error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-[1280px] flex-col items-center justify-center px-4 py-24 text-center">
      {/* Error icon */}
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-10 w-10 text-destructive"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
      </div>

      <h1 className="mb-3 text-2xl font-bold text-foreground">Something went wrong</h1>

      <p className="mb-2 max-w-md text-muted-foreground">
        We couldn&apos;t load the blog posts right now. This might be a temporary issue — please try
        again.
      </p>

      {/* Show digest for support references in production */}
      {error.digest && (
        <p className="mb-6 text-xs text-muted-foreground/60">Error reference: {error.digest}</p>
      )}

      <Button
        stellar="primary"
        onClick={reset}
        className="min-h-[44px] px-8"
        aria-label="Try loading the blog page again"
      >
        Try again
      </Button>
    </main>
  );
}
