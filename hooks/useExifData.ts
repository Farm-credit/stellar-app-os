import { useEffect, useRef, useState } from 'react';
import { parseJpegExif } from '@/lib/exif/exifParser';
import type { ExifParser, ExtractionResult, PhotoMetadata } from '@/lib/exif/types';

function hasUsableMetadata(metadata: PhotoMetadata): boolean {
  return Boolean(
    metadata.gps || metadata.capturedAt || metadata.deviceMake || metadata.deviceModel
  );
}

/**
 * Extracts EXIF metadata from a file entirely in the browser - the file
 * never leaves the device for this preview step. Exposes a `retry` so the
 * UI can recover from a transient read failure without asking the person
 * to re-pick the photo.
 */
export function useExifData(
  file: File | null,
  parser: ExifParser = parseJpegExif
): ExtractionResult & { retry: () => void } {
  const [result, setResult] = useState<ExtractionResult>({
    status: file ? 'reading' : 'idle',
    metadata: null,
    error: null,
  });
  const [retryCount, setRetryCount] = useState(0);

  // Kept out of the effect's dependency array on purpose: a caller that
  // passes an inline (non-memoized) parser would otherwise re-trigger
  // extraction on every one of its own re-renders, not just when the file
  // actually changes. The ref always points at the latest parser without
  // forcing that.
  const parserRef = useRef(parser);
  useEffect(() => {
    parserRef.current = parser;
  }, [parser]);

  useEffect(() => {
    if (!file) {
      setResult({ status: 'idle', metadata: null, error: null });
      return;
    }

    let cancelled = false;
    setResult({ status: 'reading', metadata: null, error: null });

    parserRef
      .current(file)
      .then((metadata) => {
        if (cancelled) return;
        setResult({
          status: hasUsableMetadata(metadata) ? 'success' : 'no-metadata',
          metadata,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Could not read this photo's details.";
        setResult({ status: 'error', metadata: null, error: message });
      });

    return () => {
      cancelled = true;
    };
    // `retryCount` intentionally retriggers this effect on retry().
  }, [file, retryCount]);

  return {
    ...result,
    retry: () => setRetryCount((count) => count + 1),
  };
}
