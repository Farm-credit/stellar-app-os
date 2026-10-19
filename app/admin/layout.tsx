import type { ReactNode } from 'react';
import Link from 'next/link';
import { requireAdminAccess } from '@/lib/auth/admin';

interface AdminLayoutProps {
  children: ReactNode;
}

export default async function AdminLayout({ children }: AdminLayoutProps) {
  await requireAdminAccess();

  return (
    <>
      <nav aria-label="Admin tools" className="border-b border-border px-4 py-2 sm:px-6">
        <Link
          href="/admin/tree-health"
          className="text-sm font-medium text-emerald-700 hover:underline dark:text-emerald-300"
        >
          Tree health photo review
        </Link>
      </nav>
      {children}
    </>
  );
}
