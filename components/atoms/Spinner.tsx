import { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const spinnerVariants = cva(
  'inline-block animate-spin motion-reduce:animate-none rounded-full border-2 border-current border-r-transparent',
  {
    variants: {
      size: {
        sm: 'h-4 w-4',
        md: 'h-6 w-6',
        lg: 'h-8 w-8',
      },
      variant: {
        primary: 'text-stellar-blue',
        accent: 'text-stellar-purple',
        success: 'text-stellar-green',
        destructive: 'text-destructive',
        muted: 'text-muted-foreground',
      },
    },
    defaultVariants: {
      size: 'md',
      variant: 'primary',
    },
  }
);

type SpinnerProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof spinnerVariants> & {
    srText?: string;
  };

const Spinner = forwardRef<HTMLSpanElement, SpinnerProps>(
  ({ className, size, variant, srText = 'Loading', ...props }, ref) => {
    return (
      <span
        ref={ref}
        role="status"
        aria-live="polite"
        className={cn('inline-flex items-center justify-center', className)}
        {...props}
      >
        <span aria-hidden="true" className={spinnerVariants({ size, variant })} />
        <span className="sr-only">{srText}</span>
      </span>
    );
  }
);

Spinner.displayName = 'Spinner';

export { Spinner, spinnerVariants };
export type { SpinnerProps };
