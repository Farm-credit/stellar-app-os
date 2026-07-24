import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type CardProps = HTMLAttributes<HTMLDivElement>;
type CardHeaderProps = HTMLAttributes<HTMLDivElement>;
type CardTitleProps = HTMLAttributes<HTMLHeadingElement>;
type CardDescriptionProps = HTMLAttributes<HTMLParagraphElement>;
type CardContentProps = HTMLAttributes<HTMLDivElement>;
type CardFooterProps = HTMLAttributes<HTMLDivElement>;

const Card = forwardRef<HTMLDivElement, CardProps>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn('rounded-xl border bg-card text-card-foreground shadow-sm', className)}
      {...props}
    />
  );
});
Card.displayName = 'Card';

const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(({ className, ...props }, ref) => {
  return <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />;
});
CardHeader.displayName = 'CardHeader';

const CardTitle = forwardRef<HTMLHeadingElement, CardTitleProps>(({ className, ...props }, ref) => {
  return (
    <h3
      ref={ref}
      className={cn('text-2xl font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  );
});
CardTitle.displayName = 'CardTitle';

const CardDescription = forwardRef<HTMLParagraphElement, CardDescriptionProps>(
  ({ className, ...props }, ref) => {
    return <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />;
  }
);
CardDescription.displayName = 'CardDescription';

const CardContent = forwardRef<HTMLDivElement, CardContentProps>(({ className, ...props }, ref) => {
  return <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />;
});
CardContent.displayName = 'CardContent';

const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(({ className, ...props }, ref) => {
  return <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />;
});
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
export type {
  CardProps,
  CardHeaderProps,
  CardTitleProps,
  CardDescriptionProps,
  CardContentProps,
  CardFooterProps,
};
