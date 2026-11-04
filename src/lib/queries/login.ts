import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

// These labels are already public in the web/mobile account picker. No session,
// password hash, or authorization decision is cached. Sign-in checks live rows.
export const getLoginAccounts = unstable_cache(() => prisma.user.findMany({
  where: { isActive: true, OR: [{ role: "ADMIN" }, { property: { isActive: true } }] },
  select: { name: true, email: true, role: true },
  orderBy: [{ role: "asc" }, { name: "asc" }],
}), ["public-login-accounts-v1"], { revalidate: 30, tags: ["login-accounts"] });
