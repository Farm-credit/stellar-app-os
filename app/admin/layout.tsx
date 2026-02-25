import type { ReactNode } from "react";
import { requireAdminAccess } from "@/lib/auth/admin";

interface AdminLayoutProps {
  children: ReactNode;
}

export default async function AdminLayout({ children }: AdminLayoutProps) {
  await requireAdminAccess();

  return <>{children}</>;
}
