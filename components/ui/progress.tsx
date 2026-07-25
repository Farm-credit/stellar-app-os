import * as React from 'react';
import { cn } from '@/lib/utils';

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<'div'> & { value?: number }) {
  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('bg-secondary relative h-2 w-full overflow-hidden rounded-full', className)}
      {...props}
    >
      <div
        className="bg-primary h-full w-full flex-1 transition-all"
        style={{ transform: `translateX(-${100 - (value ?? 0)}%)` }}
      />
    </div>
  );
}

export { Progress };
