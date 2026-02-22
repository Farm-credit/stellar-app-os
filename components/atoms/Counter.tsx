'use client';

import * as React from 'react';
import { Text } from '@/components/atoms/Text';

interface CounterProps {
  end: number;
  duration?: number;
  className?: string;
  prefix?: string;
  suffix?: string;
}

function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

export function Counter({
  end,
  duration = 2000,
  className,
  prefix = '',
  suffix = '',
}: CounterProps) {
  const [count, setCount] = React.useState<number>(0);
  const [hasAnimated, setHasAnimated] = React.useState<boolean>(false);
  const counterRef = React.useRef<HTMLDivElement>(null);
  const prefersReducedMotion = React.useRef<boolean>(false);

  React.useEffect(() => {
    // Check for prefers-reduced-motion
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotion.current = mediaQuery.matches;

    const handleChange = (e: MediaQueryListEvent) => {
      prefersReducedMotion.current = e.matches;
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  React.useEffect(() => {
    if (!counterRef.current || hasAnimated) return;

    const element = counterRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasAnimated) {
            setHasAnimated(true);

            // If user prefers reduced motion, show final number instantly
            if (prefersReducedMotion.current) {
              setCount(end);
              return;
            }

            // Animate the counter
            const startTime = Date.now();
            const animate = () => {
              const currentTime = Date.now();
              const elapsed = currentTime - startTime;
              const progress = Math.min(elapsed / duration, 1);
              const easedProgress = easeOutQuart(progress);
              const currentCount = Math.floor(easedProgress * end);

              setCount(currentCount);

              if (progress < 1) {
                requestAnimationFrame(animate);
              } else {
                setCount(end);
              }
            };

            requestAnimationFrame(animate);
          }
        });
      },
      { threshold: 0.1 }
    );

    observer.observe(element);

    return () => {
      observer.unobserve(element);
    };
  }, [end, duration, hasAnimated]);

  return (
    <div ref={counterRef} className={className}>
      <Text variant="h2" aria-live="polite" aria-atomic="true">
        {prefix}
        {formatNumber(count)}
        {suffix}
      </Text>
    </div>
  );
}
