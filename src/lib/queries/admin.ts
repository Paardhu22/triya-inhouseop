import "server-only";

import { prisma } from "@/lib/prisma";

export async function getAdminPropertyConfig(propertyId: string) {
  return prisma.property.findUniqueOrThrow({
    where: { id: propertyId },
    select: {
      id: true,
      name: true,
      slug: true,
      address: true,
      city: true,
      hasBlocks: true,
      blocks: {
        orderBy: [{ order: "asc" }, { name: "asc" }],
        select: { id: true, name: true },
      },
      floorTemplates: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
          roomTemplates: {
            orderBy: { sequence: "asc" },
            select: { id: true, sequence: true, label: true, sharingType: true },
          },
          _count: { select: { floors: true } },
        },
      },
      floors: {
        orderBy: [{ block: { order: "asc" } }, { order: "asc" }, { number: "asc" }],
        select: {
          id: true,
          number: true,
          name: true,
          block: { select: { id: true, name: true } },
          template: { select: { id: true, name: true } },
          rooms: {
            orderBy: [{ order: "asc" }, { number: "asc" }],
            select: {
              id: true,
              number: true,
              label: true,
              sharingType: true,
              defaultRent: true,
              defaultMaintenance: true,
              beds: {
                orderBy: { order: "asc" },
                select: {
                  id: true,
                  label: true,
                  status: true,
                  _count: { select: { tenancies: { where: { status: "ACTIVE" } } } },
                },
              },
            },
          },
        },
      },
    },
  });
}

export type AdminPropertyConfig = Awaited<ReturnType<typeof getAdminPropertyConfig>>;

