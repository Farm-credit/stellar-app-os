'use client';

import { useEffect } from 'react';
import { ErrorBoundaryFallback } from '@/components/organisms/ErrorBoundaryFallback/ErrorBoundaryFallback';
import { getErrorPresentation } from '@/lib/errorHandling';
import { logBoundaryError } from '@/lib/monitoring';

interface AppErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AppError({ error, reset }: AppErrorProps): React.ReactNode {
  useEffect(() => {
    const presentation = getErrorPresentation(error);

    logBoundaryError(error, {
      boundary: 'app-error',
      errorType: presentation.type,
      digest: error.digest,
      route: window.location.pathname,
    });
  }, [error]);

  return <ErrorBoundaryFallback error={error} onRetry={reset} />;
}
