/**
 * ZKStepIndicator — Atom
 *
 * Displays a single ZK proof step with animated icon, status ring,
 * label, and optional duration callout. Used inside ZKProofLoader.
 */

'use client';

import { forwardRef, type HTMLAttributes } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, Loader2, Clock, AlertCircle } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export type ZKStepStatus = 'pending' | 'active' | 'complete' | 'error';

const stepContainerVariants = cva(
  'flex items-center gap-3 rounded-lg px-3 py-2 transition-all duration-300',
  {
    variants: {
      status: {
        pending: 'opacity-50',
        active: 'opacity-100 bg-stellar-purple/10 border border-stellar-purple/25',
        complete: 'opacity-100 bg-stellar-green/10 border border-stellar-green/25',
        error: 'opacity-100 bg-destructive/10 border border-destructive/25',
      },
    },
    defaultVariants: {
      status: 'pending',
    },
  }
);

const iconContainerVariants = cva(
  'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300',
  {
    variants: {
      status: {
        pending: 'border-muted-foreground/30 bg-background text-muted-foreground',
        active:
          'border-stellar-purple bg-stellar-purple text-white shadow-[0_0_12px_rgba(62,27,219,0.5)]',
        complete:
          'border-stellar-green bg-stellar-green text-white shadow-[0_0_10px_rgba(0,179,107,0.4)]',
        error: 'border-destructive bg-destructive text-white',
      },
    },
    defaultVariants: {
      status: 'pending',
    },
  }
);

export interface ZKStepIndicatorProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof stepContainerVariants> {
  /** Icon to display when pending */
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  status: ZKStepStatus;
  /** Duration in ms (shown when complete) */
  durationMs?: number;
}

const ZKStepIndicator = forwardRef<HTMLDivElement, ZKStepIndicatorProps>(
  ({ className, icon, label, sublabel, status, durationMs, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(stepContainerVariants({ status }), className)}
        role="listitem"
        aria-label={`${label}: ${status}`}
        {...props}
      >
        {/* Status icon */}
        <div className={iconContainerVariants({ status })} aria-hidden="true">
          {status === 'complete' ? (
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 14, stiffness: 300 }}
            >
              <CheckCircle2 className="h-4 w-4" />
            </motion.div>
          ) : status === 'active' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : status === 'error' ? (
            <AlertCircle className="h-4 w-4" />
          ) : (
            <span className="h-4 w-4">{icon}</span>
          )}
        </div>

        {/* Labels */}
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'text-xs font-medium leading-tight transition-colors duration-200',
              status === 'complete' && 'text-stellar-green',
              status === 'active' && 'text-stellar-purple dark:text-purple-300',
              status === 'error' && 'text-destructive',
              status === 'pending' && 'text-muted-foreground'
            )}
          >
            {label}
          </p>
          {sublabel && (
            <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
              {sublabel}
            </p>
          )}
        </div>

        {/* Duration badge */}
        {status === 'complete' && durationMs !== undefined && (
          <motion.div
            initial={{ opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-1 rounded-full bg-stellar-green/20 px-2 py-0.5 text-[10px] font-mono text-stellar-green"
          >
            <Clock className="h-2.5 w-2.5" aria-hidden="true" />
            <span>{durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`}</span>
          </motion.div>
        )}

        {/* Active pulse */}
        {status === 'active' && (
          <motion.span
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
            className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-stellar-purple"
            aria-hidden="true"
          />
        )}
      </div>
    );
  }
);

ZKStepIndicator.displayName = 'ZKStepIndicator';

export { ZKStepIndicator };
