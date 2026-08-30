import * as React from 'react';
import {
  Button as ShadcnButton,
  buttonVariants as shadcnButtonVariants,
} from '@/components/ui/button';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const stellarVariants = cva('', {
  variants: {
    stellar: {
      primary:
        'bg-stellar-blue text-white hover:bg-stellar-blue/90 focus-visible:ring-stellar-blue/50',
      accent:
        'bg-stellar-purple text-white hover:bg-stellar-purple/90 focus-visible:ring-stellar-purple/50',
      cyan: 'bg-stellar-cyan text-stellar-navy hover:bg-stellar-cyan/90 focus-visible:ring-stellar-cyan/50',
      success:
        'bg-stellar-green text-stellar-navy hover:bg-stellar-green/90 focus-visible:ring-stellar-green/50',
      'primary-outline':
        'border border-stellar-blue text-stellar-blue bg-transparent hover:bg-stellar-blue/10 focus-visible:ring-stellar-blue/50',
      'accent-outline':
        'border border-stellar-purple text-stellar-purple bg-transparent hover:bg-stellar-purple/10 focus-visible:ring-stellar-purple/50',
      'success-outline':
        'border border-stellar-green text-stellar-green bg-transparent hover:bg-stellar-green/10 focus-visible:ring-stellar-green/50',
    },
    width: {
      short: 'w-24',
      medium: 'w-40',
      long: 'w-64',
      full: 'w-full',
      auto: 'w-auto',
    },
  },
  defaultVariants: {
    width: 'auto',
  },
});

type CustomButtonVariant =
  | 'default'
  | 'destructive'
  | 'outline'
  | 'secondary'
  | 'ghost'
  | 'link'
  | 'primary'
  | 'accent'
  | 'cyan'
  | 'success'
  | 'primary-outline'
  | 'accent-outline'
  | 'success-outline';

type ButtonProps = Omit<React.ComponentProps<typeof ShadcnButton>, 'variant'> &
  VariantProps<typeof stellarVariants> & {
    variant?: CustomButtonVariant;
  };

function Button({ className, stellar, width, variant, size, ...props }: ButtonProps) {
  const stellarVariant =
    stellar ??
    (variant &&
    ['primary', 'accent', 'cyan', 'success', 'primary-outline', 'accent-outline', 'success-outline'].includes(
      String(variant)
    )
      ? (variant as any)
      : undefined);

  const resolvedVariant = stellarVariant ? undefined : variant;

  return (
    <ShadcnButton
      variant={resolvedVariant as any}
      size={size}
      className={cn(
        stellarVariant ? stellarVariants({ stellar: stellarVariant, width }) : stellarVariants({ width }),
        className
      )}
      {...props}
    />
  );
}
Button.displayName = 'Button';

export { Button, shadcnButtonVariants as buttonVariants, stellarVariants };
export type { ButtonProps };
