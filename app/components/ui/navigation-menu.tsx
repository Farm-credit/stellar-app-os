'use client';
import * as React from 'react';
import { cn } from '@/lib/utils';

const NavigationMenu = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ className, children, ...props }, ref) => (
    <nav
      ref={ref}
      className={cn('relative z-10 flex max-w-max flex-1 items-center justify-center', className)}
      {...props}
    >
      {children}
    </nav>
  )
);
NavigationMenu.displayName = 'NavigationMenu';

const NavigationMenuList = React.forwardRef<
  HTMLUListElement,
  React.HTMLAttributes<HTMLUListElement>
>(({ className, children, ...props }, ref) => (
  <ul
    ref={ref}
    className={cn('group flex flex-1 list-none items-center justify-center gap-x-1', className)}
    {...props}
  >
    {children}
  </ul>
));
NavigationMenuList.displayName = 'NavigationMenuList';

const NavigationMenuItem = ({
  className,
  children,
  ...props
}: React.LiHTMLAttributes<HTMLLIElement>) => (
  <li className={className} {...props}>
    {children}
  </li>
);

const NavigationMenuTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, children, ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      'inline-flex h-10 w-max items-center justify-center rounded-md px-4 py-2 text-sm font-medium gap-1 hover:bg-accent hover:text-accent-foreground focus:outline-none disabled:pointer-events-none disabled:opacity-50',
      className
    )}
    {...props}
  >
    {children}
  </button>
));
NavigationMenuTrigger.displayName = 'NavigationMenuTrigger';

const NavigationMenuContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'absolute left-0 top-full w-auto rounded-md border bg-popover p-4 text-popover-foreground shadow-md',
      className
    )}
    {...props}
  >
    {children}
  </div>
));
NavigationMenuContent.displayName = 'NavigationMenuContent';

const NavigationMenuLink = React.forwardRef<
  HTMLAnchorElement,
  React.AnchorHTMLAttributes<HTMLAnchorElement>
>(({ className, children, ...props }, ref) => (
  <a
    ref={ref}
    className={cn(
      'block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground',
      className
    )}
    {...props}
  >
    {children}
  </a>
));
NavigationMenuLink.displayName = 'NavigationMenuLink';

export {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
  NavigationMenuLink,
};
