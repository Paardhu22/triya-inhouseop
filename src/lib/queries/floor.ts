import "server-only";

import { prisma } from "@/lib/prisma";

/** Blocks + floors for the floor/block selectors. */
export async function getFloorNavigation(propertyId: string) {
  const [property, blocks, floors] = await Promise.all([
    prisma.property.findUnique({
      where: { id: propertyId },
      select: { hasBlocks: true },
    }),
    prisma.block.findMany({
      where: { propertyId },
      orderBy: { order: "asc" },
      select: {
        id: true,
        name: true,
        floors: {
          orderBy: { number: "asc" },
          select: { id: true, number: true, name: true },
        },
      },
    }),
    prisma.floor.findMany({
      where: { propertyId, blockId: null },
      orderBy: { number: "asc" },
      select: { id: true, number: true, name: true },
    }),
  ]);

  return {
    hasBlocks: property?.hasBlocks ?? false,
    blocks,
    floors,
  };
}

/** Full room/bed layout for a floor, including the active tenant on each bed. */
export async function getFloorLayout(floorId: string, propertyId: string) {
  return prisma.room.findMany({
    where: { floorId, propertyId },
    orderBy: { order: "asc" },
    select: {
      id: true,
      number: true,
      label: true,
      sharingType: true,
      beds: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          label: true,
          status: true,
          tenancies: {
            where: { status: "ACTIVE" },
            take: 1,
            select: {
              id: true,
              paymentStatus: true,
              monthlyRent: true,
              securityDeposit: true,
              checkInDate: true,
              tenant: {
                select: { id: true, fullName: true, phone: true, photoUrl: true },
              },
            },
          },
        },
      },
    },
  });
}

export type FloorRoom = Awaited<ReturnType<typeof getFloorLayout>>[number];
export type FloorBed = FloorRoom["beds"][number];
