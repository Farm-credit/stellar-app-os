import type { ReactNode } from 'react';
import Link from 'next/link';
import { requireAdminAccess } from '@/lib/auth/admin';
import { requireCorporateAccount } from '@/lib/auth/corporate';

interface AdminLayoutProps {
  children: ReactNode;
}

export default async function AdminLayout({ children }: AdminLayoutProps) {
  await requireAdminAccess();
  await requireCorporateAccount();

  return <>{children}</>;
}
