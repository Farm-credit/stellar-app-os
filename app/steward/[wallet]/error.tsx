'use client';

import { useEffect } from 'react';

interface StewardPortfolioErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function StewardPortfolioError({ error, reset }: StewardPortfolioErrorProps) {
  useEffect(() => {
    console.error('[StewardPortfolio] Failed to load portfolio:', error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold text-foreground">Unable to load this portfolio</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Something went wrong while loading the steward’s impact data. Please try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
      >
        Try again
      </button>
    </main>
  );
}
