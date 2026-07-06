import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Every property (active and deactivated) with its scoped manager account and a few
 * counts, for the admin "Properties & accounts" panel. Admin-only data — the caller
 * (the /admin page) already gates on role.
 */
export async function listPropertiesForAdmin() {
  return prisma.property.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      city: true,
      isActive: true,
      hasBlocks: true,
      isFlat: true,
      _count: { select: { floors: true, tenants: true, beds: true } },
      users: {
        where: { role: { not: "ADMIN" } },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { id: true, email: true, name: true },
      },
    },
  });
}

export type AdminPropertyRow = Awaited<ReturnType<typeof listPropertiesForAdmin>>[number];
