'use client';
import * as React from 'react';
import { useIsMobile } from './use-mobile';
import { Sheet, SheetContent } from './sheet';
import { cn } from '@/lib/utils';

const SidebarContext = React.createContext<{
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
}>(null!);

export function SidebarProvider({
  children,
  defaultOpen = true,
}: {
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return <SidebarContext.Provider value={{ open, setOpen }}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) throw new Error('useSidebar must be used within a SidebarProvider');
  return context;
}

export function Sidebar({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const { open, setOpen } = useSidebar();
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className={cn('w-72 p-0', className)}>
          {children}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <div
      className={cn(
        'h-screen w-64 flex-col border-r bg-background',
        open ? 'flex' : 'hidden',
        className
      )}
    >
      {children}
    </div>
  );
}

export function SidebarTrigger() {
  const { setOpen } = useSidebar();
  return (
    <button
      onClick={() => setOpen((o) => !o)}
      className="inline-flex items-center justify-center rounded-md p-2 hover:bg-accent hover:text-accent-foreground"
    >
      <span className="sr-only">Toggle sidebar</span>
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="4" y1="12" x2="20" y2="12" />
        <line x1="4" y1="6" x2="20" y2="6" />
        <line x1="4" y1="18" x2="20" y2="18" />
      </svg>
    </button>
  );
}

export const SidebarHeader = ({ children }: { children: React.ReactNode }) => (
  <div className="px-4 py-2">{children}</div>
);
export const SidebarContent = ({ children }: { children: React.ReactNode }) => (
  <div className="flex-1 overflow-y-auto px-4 py-2">{children}</div>
);
export const SidebarFooter = ({ children }: { children: React.ReactNode }) => (
  <div className="p-4">{children}</div>
);
export function SidebarMenu({ children }: { children: React.ReactNode }) {
  return <nav className="flex flex-col space-y-1">{children}</nav>;
}
export function SidebarMenuItem({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}
export function SidebarMenuButton({
  children,
  active,
  className,
}: {
  children: React.ReactNode;
  active?: boolean;
  className?: string;
}) {
  return (
    <a
      className={cn(
        'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground',
        active && 'bg-accent text-accent-foreground',
        className
      )}
    >
      {children}
    </a>
  );
}
