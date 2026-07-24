import { forwardRef, type HTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const alertVariants = cva('rounded-lg border px-4 py-3 text-sm', {
  variants: {
    variant: {
      info: 'border-stellar-blue/30 bg-stellar-blue/10 text-stellar-blue',
      success: 'border-stellar-green/30 bg-stellar-green/10 text-stellar-green',
      warning: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
      destructive: 'border-destructive/40 bg-destructive/10 text-destructive',
    },
  },
  defaultVariants: {
    variant: 'info',
  },
});

type AlertProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof alertVariants> & {
    icon?: LucideIcon;
    role?: 'alert' | 'status';
  };

const Alert = forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, icon: Icon, role, children, ...props }, ref) => {
    const resolvedRole =
      role ?? (variant === 'warning' || variant === 'destructive' ? 'alert' : 'status');

    return (
      <div
        ref={ref}
        role={resolvedRole}
        aria-live={resolvedRole === 'alert' ? 'assertive' : 'polite'}
        className={cn('flex items-start gap-3', alertVariants({ variant }), className)}
        {...props}
      >
        {Icon ? <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : null}
        <div className="min-w-0 flex-1 space-y-1">{children}</div>
      </div>
    );
  }
);
Alert.displayName = 'Alert';

const AlertTitle = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    return <p ref={ref} className={cn('font-medium leading-tight', className)} {...props} />;
  }
);
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    return <p ref={ref} className={cn('text-sm opacity-90', className)} {...props} />;
  }
);
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription, alertVariants };
export type { AlertProps };
