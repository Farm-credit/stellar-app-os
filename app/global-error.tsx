'use client';

import { useEffect } from 'react';
import { ErrorBoundaryFallback } from '@/components/organisms/ErrorBoundaryFallback/ErrorBoundaryFallback';
import { getErrorPresentation } from '@/lib/errorHandling';
import { logBoundaryError } from '@/lib/monitoring';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps): React.ReactNode {
  useEffect(() => {
    const presentation = getErrorPresentation(error);

    logBoundaryError(error, {
      boundary: 'global-error',
      errorType: presentation.type,
      digest: error.digest,
      route: typeof window !== 'undefined' ? window.location.pathname : undefined,
    });
  }, [error]);

  return (
    <html lang="en">
      <body>
        <ErrorBoundaryFallback error={error} onRetry={reset} />
      </body>
    </html>
  );
}
