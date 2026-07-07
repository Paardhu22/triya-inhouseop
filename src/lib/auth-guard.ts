import "server-only";

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import type { Role } from "@/generated/prisma/client";

/** Returns the session if the signed-in user has one of `roles`, else null. For server actions. */
export async function requireRole(...roles: Role[]) {
  const session = await auth();
  if (!session?.user || !roles.includes(session.user.role)) return null;
  return session;
}

/** Like requireRole but redirects instead of returning null. For page-level guards. */
export async function requireRoleOrRedirect(roles: Role[], redirectTo = "/dashboard") {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!roles.includes(session.user.role)) redirect(redirectTo);
  return session;
}
