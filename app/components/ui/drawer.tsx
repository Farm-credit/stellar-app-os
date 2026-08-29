'use client';
import * as React from 'react';
import { Sheet, SheetContent, SheetTrigger, SheetClose } from './sheet';
import { cn } from '@/lib/utils';

const Drawer = Sheet;
const DrawerTrigger = SheetTrigger;
const DrawerClose = SheetClose;

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof SheetContent>,
  React.ComponentPropsWithoutRef<typeof SheetContent> & { className?: string }
>(({ className, children, ...props }, ref) => (
  <SheetContent ref={ref} side="bottom" className={cn('rounded-xl', className)} {...props}>
    <div className="mx-auto mt-4 h-2 w-[100px] rounded-full bg-muted" />
    {children}
  </SheetContent>
));
DrawerContent.displayName = 'DrawerContent';

export { Drawer, DrawerTrigger, DrawerClose, DrawerContent };
