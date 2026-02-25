import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const ADMIN_ROLE_COOKIE_NAME = "farmcredit_role";
const ADMIN_ROLE_VALUE = "admin";

export async function isAdminRequest(): Promise<boolean> {
  const cookieStore = await cookies();
  const role = cookieStore.get(ADMIN_ROLE_COOKIE_NAME)?.value;

  return role === ADMIN_ROLE_VALUE;
}

export async function requireAdminAccess(): Promise<void> {
  const isAdmin = await isAdminRequest();

  if (!isAdmin) {
    redirect("/");
  }
}
