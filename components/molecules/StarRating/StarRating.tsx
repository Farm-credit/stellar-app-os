'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StarRatingProps {
  /** Current rating value (0-5). */
  rating: number;
  /** Maximum number of stars to display. */
  maxStars?: number;
  /** If true, stars are clickable (for review forms). */
  interactive?: boolean;
  /** Called when the user selects a rating. */
  onRatingChange?: (rating: number) => void;
  /** Size of the star icons. */
  size?: 'sm' | 'md' | 'lg';
  /** Optional label for accessibility. */
  ariaLabel?: string;
  /** Whether the component is disabled. */
  disabled?: boolean;
}

const SIZE_CLASSES = {
  sm: 'h-3.5 w-3.5',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
} as const;

/**
 * Star rating component supporting both display (read-only) and interactive
 * (selectable) modes. Used in planter reviews for sponsor ratings.
 */
export function StarRating({
  rating,
  maxStars = 5,
  interactive = false,
  onRatingChange,
  size = 'md',
  ariaLabel = 'Rating',
  disabled = false,
}: StarRatingProps) {
  const [hoverRating, setHoverRating] = useState(0);

  const displayRating = interactive && hoverRating > 0 ? hoverRating : rating;

  return (
    <div
      className="inline-flex items-center gap-0.5"
      role={interactive ? 'radiogroup' : 'img'}
      aria-label={`${ariaLabel}: ${rating} out of ${maxStars} stars`}
    >
      {Array.from({ length: maxStars }, (_, i) => {
        const starIndex = i + 1;
        const filled = starIndex <= Math.floor(displayRating);
        const halfFilled = !filled && starIndex <= displayRating;

        return (
          <button
            key={starIndex}
            type="button"
            disabled={!interactive || disabled}
            onClick={() => {
              if (interactive && onRatingChange) {
                onRatingChange(starIndex);
              }
            }}
            onMouseEnter={() => interactive && !disabled && setHoverRating(starIndex)}
            onMouseLeave={() => interactive && setHoverRating(0)}
            className={cn(
              'relative transition-transform',
              interactive && !disabled && 'cursor-pointer hover:scale-110',
              !interactive && 'cursor-default',
              disabled && 'opacity-50'
            )}
            aria-label={`${starIndex} star${starIndex !== 1 ? 's' : ''}`}
            role={interactive ? 'radio' : undefined}
            aria-checked={interactive ? starIndex === rating : undefined}
          >
            <Star
              className={cn(
                SIZE_CLASSES[size],
                filled
                  ? 'fill-amber-400 text-amber-400'
                  : halfFilled
                    ? 'fill-amber-400/50 text-amber-400'
                    : 'fill-transparent text-muted-foreground/40'
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
