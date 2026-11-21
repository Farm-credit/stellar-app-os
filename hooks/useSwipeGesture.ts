'use client';

import { useRef, useCallback, type RefObject } from 'react';

interface UseSwipeGestureOptions {
  /** Called when a right swipe exceeds the threshold */
  onSwipeRight: () => void;
  /** Minimum horizontal distance (px) to trigger a swipe */
  threshold?: number;
  /** Maximum vertical distance (px) allowed before the gesture is cancelled */
  verticalThreshold?: number;
}

interface UseSwipeGestureReturn {
  /** Attach to the swipable element's onTouchStart */
  onTouchStart: (e: React.TouchEvent) => void;
  /** Attach to the swipable element's onTouchMove */
  onTouchMove: (e: React.TouchEvent) => void;
  /** Attach to the swipable element's onTouchEnd */
  onTouchEnd: (e: React.TouchEvent) => void;
}

/**
 * Detects a horizontal swipe gesture on touch devices.
 *
 * Tracks touchstart → touchmove → touchend and fires `onSwipeRight`
 * when the user drags rightward past the threshold without too much
 * vertical movement.
 */
export function useSwipeGesture({
  onSwipeRight,
  threshold = 80,
  verticalThreshold = 100,
}: UseSwipeGestureOptions): UseSwipeGestureReturn {
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent): void => {
    const touch = e.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const onTouchMove = useCallback((_e: React.TouchEvent): void => {
    // No-op: we only read final delta in onTouchEnd
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent): void => {
      if (!touchStart.current) return;

      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStart.current.x;
      const dy = Math.abs(touch.clientY - touchStart.current.y);

      touchStart.current = null;

      if (dx > threshold && dy < verticalThreshold) {
        onSwipeRight();
      }
    },
    [onSwipeRight, threshold, verticalThreshold]
  );

  return { onTouchStart, onTouchMove, onTouchEnd };
}

/**
 * Returns a ref that can be attached to the swipeable element.
 * Useful when you need the hook to work without passing event handlers
 * directly (e.g. inside framer-motion components).
 */
export function useSwipeRef(): RefObject<HTMLDivElement | null> {
  return useRef<HTMLDivElement>(null);
}
