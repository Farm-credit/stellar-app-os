import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const creditStatusVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors',
  {
    variants: {
      status: {
        active:
          'bg-stellar-green/10 text-stellar-green border border-stellar-green/20 hover:bg-stellar-green/15',
        retired:
          'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-150 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700',
      },
    },
    defaultVariants: {
      status: 'active',
    },
  }
);

export interface CreditStatusBadgeProps extends VariantProps<typeof creditStatusVariants> {
  className?: string;
}

export function CreditStatusBadge({ status, className }: CreditStatusBadgeProps) {
  const displayStatus = status === 'active' ? 'Active' : 'Retired';
  const dotColor = status === 'active' ? 'bg-stellar-green' : 'bg-gray-400';

  return (
    <span className={cn(creditStatusVariants({ status, className }))}>
      <span className={cn('h-1.5 w-1.5 rounded-full', dotColor)} aria-hidden="true" />
      {displayStatus}
    </span>
  );
}
