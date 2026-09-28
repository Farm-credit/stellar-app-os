/**
 * TreeImage
 *
 * Wraps Next.js `<Image>` and automatically generates accessible alt text for
 * tree photos via AWS Rekognition.
 *
 * Priority order for alt text:
 *   1. Explicit `alt` prop (if provided and non-empty)
 *   2. Auto-generated alt text from the `imageKey` (S3 key) via useAltText
 *   3. Generic fallback "Tree photo"
 *
 * WCAG 2.1 SC 1.1.1 compliance: the `alt` attribute is never empty for a
 * meaningful image. During loading we use a temporary descriptive value.
 */

'use client';

import * as React from 'react';
import Image, { type ImageProps } from 'next/image';
import { useAltText } from '@/hooks/useAltText';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TreeImageProps extends Omit<ImageProps, 'alt'> {
  /**
   * Explicit alt text. When provided, it takes priority over auto-generation.
   * Pass an empty string only for decorative images (role="presentation").
   */
  alt?: string;
  /**
   * S3 object key used to fetch auto-generated alt text via Rekognition.
   * When provided alongside an explicit `alt`, the explicit `alt` wins.
   */
  imageKey?: string | null;
  /**
   * Additional class names for the outer wrapper div when `showLoadingState`
   * is true and the image is loading.
   */
  wrapperClassName?: string;
  /**
   * Whether to show a subtle loading placeholder while alt text is being
   * fetched. Defaults to true.
   */
  showLoadingState?: boolean;
}

const GENERIC_ALT = 'Tree photo';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

function TreeImage({
  alt,
  imageKey,
  wrapperClassName,
  showLoadingState = true,
  className,
  ...imageProps
}: TreeImageProps): React.JSX.Element {
  // Fetch alt text only when imageKey is provided and no explicit alt given.
  const shouldFetch = Boolean(imageKey) && !alt;
  const { altText: generatedAltText, isLoading } = useAltText(shouldFetch ? imageKey : null);

  // Resolve the effective alt text:
  //   - explicit alt prop wins
  //   - generated alt text from Rekognition second
  //   - generic fallback last
  const effectiveAlt: string =
    alt !== undefined && alt !== ''
      ? alt
      : generatedAltText !== GENERIC_ALT || !isLoading
        ? generatedAltText
        : GENERIC_ALT;

  // During alt-text fetch show a temporary aria-label so screen readers
  // still announce something meaningful immediately.
  const ariaLabel = isLoading && !alt ? 'Loading tree photo description…' : undefined;

  return (
    <span
      role="img"
      aria-label={ariaLabel}
      className={cn('inline-block', wrapperClassName)}
      aria-busy={isLoading && showLoadingState}
    >
      <Image {...imageProps} alt={effectiveAlt} className={className} />
    </span>
  );
}

TreeImage.displayName = 'TreeImage';

export { TreeImage };
