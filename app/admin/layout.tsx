import type { ReactNode } from 'react';
import { requireAdminAccess } from '@/lib/auth/admin';

interface AdminLayoutProps {
  children: ReactNode;
}

export default async function AdminLayout({ children }: AdminLayoutProps) {
  await requireAdminAccess();

  return (
    <>
      <select name="status"><option value="all">All</option><option value="pending">Pending</option><option value="planted">Planted</option><option value="verified">Verified</option><option value="failed">Failed</option></select>
      {children}
    </>
  );
}