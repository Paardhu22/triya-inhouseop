import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Every PROPERTY_OWNER account with the properties it owns, for the App Owner
 * console's "Property owners" panel. App-Owner-only data — the caller (the /admin
 * page) already gates on role.
 */
export async function listPropertyOwners() {
  return prisma.user.findMany({
    where: { role: "PROPERTY_OWNER" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      ownedProperties: {
        select: { property: { select: { id: true, name: true } } },
      },
    },
  });
}

export type PropertyOwnerRow = Awaited<ReturnType<typeof listPropertyOwners>>[number];
