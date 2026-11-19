/**
 * ZKProofStatusBadge — Atom
 *
 * A compact pill badge that represents the overall status of the ZK proof
 * loader: idle, running, success, or error. Used in headers / summary rows.
 */

'use client';

import { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Shield, ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ZKProofStatus = 'idle' | 'running' | 'success' | 'error';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-300',
  {
    variants: {
      status: {
        idle: 'border-muted-foreground/30 bg-muted/60 text-muted-foreground',
        running:
          'border-stellar-purple/50 bg-stellar-purple/10 text-stellar-purple dark:text-purple-300',
        success:
          'border-stellar-green/50 bg-stellar-green/10 text-stellar-green shadow-[0_0_8px_rgba(0,179,107,0.2)]',
        error: 'border-destructive/50 bg-destructive/10 text-destructive',
      },
    },
    defaultVariants: {
      status: 'idle',
    },
  }
);

export interface ZKProofStatusBadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  status: ZKProofStatus;
}

const ZKProofStatusBadge = forwardRef<HTMLSpanElement, ZKProofStatusBadgeProps>(
  ({ className, status, ...props }, ref) => {
    const icons: Record<ZKProofStatus, React.ReactNode> = {
      idle: <Shield className="h-3.5 w-3.5" aria-hidden="true" />,
      running: <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />,
      success: <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />,
      error: <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />,
    };

    const labels: Record<ZKProofStatus, string> = {
      idle: 'ZK Proof Ready',
      running: 'Generating…',
      success: 'Proof Valid',
      error: 'Proof Failed',
    };

    return (
      <span
        ref={ref}
        role="status"
        aria-live="polite"
        aria-label={labels[status ?? 'idle']}
        className={cn(badgeVariants({ status }), className)}
        {...props}
      >
        {icons[status ?? 'idle']}
        {labels[status ?? 'idle']}
      </span>
    );
  }
);

ZKProofStatusBadge.displayName = 'ZKProofStatusBadge';

export { ZKProofStatusBadge };
