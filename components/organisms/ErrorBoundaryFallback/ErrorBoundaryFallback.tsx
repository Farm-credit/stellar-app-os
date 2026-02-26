'use client';

import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/molecules/Card';
import { getErrorPresentation } from '@/lib/errorHandling';

interface ErrorBoundaryFallbackProps {
  error: Error & { digest?: string };
  onRetry: () => void;
  variant?: 'overlay' | 'page';
}

export function ErrorBoundaryFallback({
  error,
  onRetry,
  variant = 'overlay',
}: ErrorBoundaryFallbackProps): React.ReactNode {
  const presentation = getErrorPresentation(error);
  const isOverlay = variant === 'overlay';
  const baseClass =
    'flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-slate-50/90 via-cyan-50/70 to-slate-100/90 p-4 backdrop-blur-sm dark:from-slate-950/80 dark:via-slate-900/70 dark:to-slate-950/90 sm:p-6 lg:p-10';
  const containerClass = isOverlay ? `fixed inset-0 z-50 ${baseClass}` : `mx-auto max-w-6xl ${baseClass}`;

  return (
    <div className={containerClass} role="alertdialog">
      <Card className="w-full max-w-xl border-white/40 bg-white/70 shadow-2xl shadow-slate-900/10 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/60">
        <CardHeader className="space-y-3">
          <Text variant="small" className="font-semibold uppercase tracking-wide text-muted-foreground">
            {presentation.type} error
          </Text>
          <CardTitle>{presentation.title}</CardTitle>
          <Text variant="muted" role="alert" aria-live="assertive">
            {presentation.message}
          </Text>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <Button
            onClick={onRetry}
            size="lg"
            className="min-h-11 w-full sm:w-auto"
            aria-label="Try the failed operation again"
          >
            Try Again
          </Button>

          {error.digest ? (
            <Text variant="small" className="text-muted-foreground">
              Reference: {error.digest}
            </Text>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
