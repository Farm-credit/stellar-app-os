import { forwardRef, type InputHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const inputVariants = cva(
  'flex w-full rounded-lg border bg-background px-3 text-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
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
      inputSize: {
        sm: 'h-8 px-2.5 text-xs',
        md: 'h-10 px-3 text-sm',
        lg: 'h-12 px-4 text-base',
      },
    },
    defaultVariants: {
      variant: 'default',
      inputSize: 'md',
    },
  }
);

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> &
  VariantProps<typeof inputVariants>;

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, variant, inputSize, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(inputVariants({ variant, inputSize, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input, inputVariants };
export type { InputProps };
