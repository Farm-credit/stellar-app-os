'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface LiveCounterProps {
  value: number;
  /** Animation length in ms when the value changes. */
  duration?: number;
  className?: string;
  suffix?: string;
  format?: (value: number) => string;
}

const defaultFormat = (value: number) => Math.round(value).toLocaleString('en-US');

/**
 * Number that animates from its previous value to each new value, so live
 * totals visibly tick upwards. Honours prefers-reduced-motion.
 */
export function LiveCounter({
  value,
  duration = 800,
  className,
  suffix = '',
  format = defaultFormat,
}: LiveCounterProps) {
  const [display, setDisplay] = useState(value);
  const displayRef = useRef(value);

  useEffect(() => {
    const from = displayRef.current;
    if (from === value) return;

    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || duration <= 0) {
      displayRef.current = value;
      setDisplay(value);
      return;
    }

    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (value - from) * eased;
      displayRef.current = next;
      setDisplay(next);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return (
    <span className={cn('tabular-nums', className)}>
      {format(display)}
      {suffix}
    </span>
  );
}
