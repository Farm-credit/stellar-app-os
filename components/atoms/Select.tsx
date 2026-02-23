import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const selectVariants = cva(
  'flex w-full rounded-lg border bg-background px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none cursor-pointer',
  {
    variants: {
      variant: {
        default: 'border-input focus-visible:ring-ring',
        primary:
          'border-stellar-blue/30 focus-visible:ring-stellar-blue focus-visible:border-stellar-blue',
        accent:
          'border-stellar-purple/30 focus-visible:ring-stellar-purple focus-visible:border-stellar-purple',
        success:
          'border-stellar-green/30 focus-visible:ring-stellar-green focus-visible:border-stellar-green',
        destructive:
          'border-destructive/50 focus-visible:ring-destructive focus-visible:border-destructive text-destructive',
        ghost: 'border-transparent bg-muted focus-visible:ring-ring',
      },
      selectSize: {
        sm: 'h-8 px-2.5 text-xs',
        md: 'h-10 px-3 text-sm',
        lg: 'h-12 px-4 text-base',
      },
    },
    defaultVariants: {
      variant: 'default',
      selectSize: 'md',
    },
  }
);

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> &
  VariantProps<typeof selectVariants>;

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, variant, selectSize, children, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          className={cn(selectVariants({ variant, selectSize, className }))}
          ref={ref}
          {...props}
        >
          {children}
        </select>
        <div
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
          aria-hidden="true"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="text-muted-foreground"
          >
            <path
              d="M2 4L6 8L10 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    );
  }
);
Select.displayName = 'Select';

export { Select, selectVariants };
export type { SelectProps };
