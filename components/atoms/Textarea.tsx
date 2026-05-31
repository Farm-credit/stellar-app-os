import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const textareaVariants = cva(
  'flex w-full rounded-lg border bg-background px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
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
        sm: 'min-h-20 px-2.5 py-1.5 text-xs',
        md: 'min-h-24 px-3 py-2 text-sm',
        lg: 'min-h-32 px-4 py-3 text-base',
      },
      resize: {
        none: 'resize-none',
        vertical: 'resize-y',
        horizontal: 'resize-x',
        both: 'resize',
      },
    },
    defaultVariants: {
      variant: 'default',
      inputSize: 'md',
      resize: 'vertical',
    },
  }
);

type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'> &
  VariantProps<typeof textareaVariants> & {
    error?: boolean;
  };

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    { className, variant, inputSize, resize, error, 'aria-invalid': ariaInvalid, ...props },
    ref
  ) => {
    const hasError = Boolean(error || ariaInvalid === true || ariaInvalid === 'true');

    return (
      <textarea
        className={cn(
          textareaVariants({ variant, inputSize, resize, className }),
          hasError &&
            variant !== 'destructive' &&
            'border-destructive/50 text-destructive focus-visible:border-destructive focus-visible:ring-destructive'
        )}
        aria-invalid={hasError ? true : ariaInvalid}
        ref={ref}
        {...props}
      />
    );
  }
);

Textarea.displayName = 'Textarea';

export { Textarea, textareaVariants };
export type { TextareaProps };
