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

/**
 * A single PROPERTY_OWNER with the properties it owns, for the App Owner console's
 * owner detail view. The caller (the /admin/owners/[id] page) gates on role.
 */
export async function getPropertyOwnerDetail(id: string) {
  return prisma.user.findFirst({
    where: { id, role: "PROPERTY_OWNER" },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      isActive: true,
      createdAt: true,
      ownedProperties: {
        orderBy: { property: { name: "asc" } },
        select: {
          property: {
            select: {
              id: true,
              name: true,
              city: true,
              slug: true,
              isActive: true,
              hasBlocks: true,
              _count: { select: { floors: true, tenants: true, beds: true } },
            },
          },
        },
      },
    },
  });
}

export type PropertyOwnerDetail = NonNullable<Awaited<ReturnType<typeof getPropertyOwnerDetail>>>;
