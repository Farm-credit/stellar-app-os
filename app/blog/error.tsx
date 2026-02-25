'use client';

import { JSX, useEffect } from 'react';
import { Button } from '@/components/atoms/Button';
import { useAppTranslation } from '@/hooks/useTranslation';

interface BlogErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function BlogError({ error, reset }: BlogErrorProps): JSX.Element {
  const { t } = useAppTranslation();

  useEffect(() => {
    console.error('[Blog] Unhandled error:', error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-[1280px] flex-col items-center justify-center px-4 py-24 text-center">
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

      <h1 className="mb-3 text-2xl font-bold text-foreground">{t('blog.errorTitle')}</h1>

      <p className="mb-2 max-w-md text-muted-foreground">{t('blog.errorDesc')}</p>

      {error.digest && (
        <p className="mb-6 text-xs text-muted-foreground/60">
          {t('blog.errorReference', { digest: error.digest })}
        </p>
      )}

      <Button
        stellar="primary"
        onClick={reset}
        className="min-h-[44px] px-8"
        aria-label={t('blog.tryAgainAriaLabel')}
      >
        {t('blog.tryAgain')}
      </Button>
    </main>
  );
}