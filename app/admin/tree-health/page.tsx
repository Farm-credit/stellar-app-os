import type { Metadata } from 'next';
import { requireAdminAccess } from '@/lib/auth/admin';
import { TreeHealthReviewClient } from './TreeHealthReviewClient';

export const metadata: Metadata = {
  title: 'Tree Health Photo Review | FarmCredit Admin',
  robots: { index: false, follow: false },
};

export default async function TreeHealthAdminPage() {
  await requireAdminAccess();
  return <TreeHealthReviewClient />;
}
