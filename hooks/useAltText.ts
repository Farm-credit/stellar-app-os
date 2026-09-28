/**
 * useAltText
 *
 * Fetches auto-generated alt text for a tree photo from the `/api/alt-text`
 * endpoint using an S3 image key.
 *
 * @param imageKey - S3 object key, or null/undefined to skip the fetch.
 * @returns { altText, isLoading, error }
 *
 * Falls back to 'Tree photo' when the key is absent or the API call fails.
 */

'use client';

import { useState, useEffect } from 'react';

export interface UseAltTextReturn {
  altText: string;
  isLoading: boolean;
  error: string | null;
}

const DEFAULT_ALT_TEXT = 'Tree photo';

export function useAltText(imageKey: string | null | undefined): UseAltTextReturn {
  const [altText, setAltText] = useState<string>(DEFAULT_ALT_TEXT);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!imageKey) {
      setAltText(DEFAULT_ALT_TEXT);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    const fetchAltText = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/alt-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ s3Key: imageKey }),
        });

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        const data = (await response.json()) as { altText?: string };

        if (!cancelled) {
          setAltText(data.altText ?? DEFAULT_ALT_TEXT);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          setError(message);
          setAltText(DEFAULT_ALT_TEXT);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void fetchAltText();

    return () => {
      cancelled = true;
    };
  }, [imageKey]);

  return { altText, isLoading, error };
}
