import type { ReactNode } from 'react';
import Link from 'next/link';
import { requireAdminAccess } from '@/lib/auth/admin';
import { requireCorporateAccount } from '@/lib/auth/corporate';

interface AdminLayoutProps {
  children: ReactNode;
}

interface AdminNavItem {
  href: string;
  label: string;
  description: string;
}

const adminNavItems: AdminNavItem[] = [
  {
    href: '/admin/newsletters',
    label: 'Forest Health Newsletter',
    description:
      'Compose, schedule, and publish monthly newsletters with platform news, featured stories, species spotlights, and conservation tips.',
  },
  {
    href: '/admin/seed-batches',
    label: 'Seed Distribution',
    description:
      'Create and track seed batches through collection, storage, distribution, and planting.',
  },
];

export default async function AdminLayout({ children }: AdminLayoutProps) {
  await requireAdminAccess();
  await requireCorporateAccount();

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 shrink-0 border-r border-gray-200 bg-gray-50 p-4">
        <nav aria-label="Admin navigation">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Admin
          </h2>
          <ul className="space-y-2">
            {adminNavItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 hover:text-gray-900"
                  title={item.description}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}