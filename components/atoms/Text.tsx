import { type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const textVariants = cva('', {
  variants: {
    variant: {
      h1: 'text-4xl font-bold tracking-tight',
      h2: 'text-3xl font-semibold tracking-tight',
      h3: 'text-2xl font-semibold',
      h4: 'text-xl font-semibold',
      body: 'text-base leading-7',
      small: 'text-sm leading-6',
      muted: 'text-sm text-muted-foreground',
    },
  },
  defaultVariants: {
    variant: 'body',
  },
});

type TextProps = HTMLAttributes<HTMLElement> &
  VariantProps<typeof textVariants> & {
    as?: 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'span';
  };

function Text({ className, variant, as, ...props }: TextProps) {
  const elementMap = {
    h1: 'h1',
    h2: 'h2',
    h3: 'h3',
    h4: 'h4',
    body: 'p',
    small: 'p',
    muted: 'p',
  } as const;

  const Component = as || elementMap[variant || 'body'] || 'p';

  return <Component className={cn(textVariants({ variant, className }))} {...props} />;
}

export { Text, textVariants };
export type { TextProps };
