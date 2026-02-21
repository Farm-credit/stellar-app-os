/**
 * Counter Atom Component
 *
 * Animated counter that counts up to target value when entering viewport.
 * Respects prefers-reduced-motion for accessibility.
 */

"use client";

import { easeOutExpo, prefersReducedMotion } from "@/lib/Impact-utils";
import { useEffect, useRef, useState } from "react";

interface CounterProps {
  /** Target value to count to */
  value: number;
  /** Animation duration in milliseconds */
  duration?: number;
  /** Custom formatter function */
  formatter?: (value: number) => string;
  /** Additional CSS classes */
  className?: string;
}

export function Counter({
  value,
  duration = 2000,
  formatter = (v) => v.toLocaleString(),
  className = "",
}: CounterProps) {
  const [count, setCount] = useState(0);
  const [hasAnimated, setHasAnimated] = useState(false);
  const elementRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    // Set up intersection observer to trigger on viewport entry
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated) {
          setHasAnimated(true);

          // Skip animation if user prefers reduced motion
          if (prefersReducedMotion()) {
            setCount(value);
            return;
          }

          // Animate counter with easing
          const startTime = Date.now();

          const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easedProgress = easeOutExpo(progress);
            const currentCount = Math.floor(value * easedProgress);

            setCount(currentCount);

            if (progress < 1) {
              requestAnimationFrame(animate);
            } else {
              setCount(value); // Ensure exact final value
            }
          };

          requestAnimationFrame(animate);
        }
      },
      {
        threshold: 0.3, // Trigger when 30% visible
        rootMargin: "0px 0px -50px 0px", // Slight offset from bottom
      },
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [value, duration, hasAnimated]);

  return (
    <span ref={elementRef} className={className}>
      {formatter(count)}
    </span>
  );
}
