'use client';

import { useEffect, useState } from 'react';

export const TREE_IMAGE_LOAD_TIMEOUT_MS = 30_000;

interface TreeImageProps {
  src: string;
  alt: string;
}

export function TreeImage({ src, alt }: TreeImageProps) {
  const [attempt, setAttempt] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setTimedOut(false);
    setLoaded(false);
    const timeout = window.setTimeout(() => setTimedOut(true), TREE_IMAGE_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [src, attempt]);

  if (timedOut) {
    return (
      <div
        role="alert"
        className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl bg-muted p-6 text-center"
      >
        <p className="text-sm text-muted-foreground">
          This image is taking longer than expected to load.
        </p>
        <button
          type="button"
          onClick={() => setAttempt((value) => value + 1)}
          className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Retry image
        </button>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={`${src}-${attempt}`}
      src={src}
      alt={alt}
      onLoad={() => setLoaded(true)}
      onError={() => setTimedOut(true)}
      className={`w-full rounded-xl object-cover transition-opacity ${loaded ? 'opacity-100' : 'opacity-0'}`}
    />
  );
}

export default TreeImage;

export type { TreeImageProps };
