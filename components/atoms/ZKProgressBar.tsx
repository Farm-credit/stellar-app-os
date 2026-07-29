/**
 * ZKProgressBar — Atom
 *
 * Animated gradient progress bar styled for ZK proof generation.
 * Supports indeterminate pulse mode and a shimmer overlay.
 */

'use client';

import { forwardRef, type HTMLAttributes } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface ZKProgressBarProps extends HTMLAttributes<HTMLDivElement> {
  /** 0–100 */
  value: number;
  /** Show the numeric percentage label */
  showLabel?: boolean;
  /** Step label shown on the left */
  stepLabel?: string;
  /** Indeterminate pulsing state (e.g. waiting for browser crypto) */
  indeterminate?: boolean;
}

const ZKProgressBar = forwardRef<HTMLDivElement, ZKProgressBarProps>(
  ({ className, value, showLabel = true, stepLabel, indeterminate = false, ...props }, ref) => {
    const clamped = Math.min(100, Math.max(0, value));

    return (
      <div ref={ref} className={cn('space-y-1.5', className)} {...props}>
        {/* Header row */}
        {(stepLabel || showLabel) && (
          <div className="flex items-center justify-between">
            {stepLabel && (
              <span className="font-mono text-[11px] text-muted-foreground">{stepLabel}</span>
            )}
            {showLabel && !indeterminate && (
              <span
                className="ml-auto font-mono text-[11px] font-semibold text-stellar-cyan"
                aria-label={`${clamped}% complete`}
              >
                {clamped}%
              </span>
            )}
          </div>
        )}

        {/* Track */}
        <div
          role="progressbar"
          aria-valuenow={indeterminate ? undefined : clamped}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={indeterminate ? 'Loading…' : `${clamped}%`}
          className="relative h-2.5 w-full overflow-hidden rounded-full border border-slate-800 bg-slate-950/60"
        >
          {indeterminate ? (
            /* Indeterminate mode — bouncing stripe */
            <motion.div
              className="absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-r from-stellar-purple via-stellar-blue to-stellar-cyan"
              animate={{ x: ['-100%', '400%'] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            />
          ) : (
            <>
              {/* Filled bar */}
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-stellar-purple via-stellar-blue to-stellar-cyan"
                style={{ width: `${clamped}%` }}
                initial={{ width: '0%' }}
                animate={{ width: `${clamped}%` }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
              />
              {/* Shimmer overlay */}
              {clamped > 0 && clamped < 100 && (
                <motion.div
                  className="absolute inset-y-0 w-16 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                  animate={{ x: ['-4rem', '100vw'] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'linear', repeatDelay: 0.4 }}
                />
              )}
            </>
          )}
        </div>
      </div>
    );
  }
);

ZKProgressBar.displayName = 'ZKProgressBar';

export { ZKProgressBar };
