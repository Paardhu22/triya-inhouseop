import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Every ACTIVE tenancy in the property with the data needed to chase rent
 * collections: tenant contact, location, and the current dues / deposit snapshot.
 */
export async function getCollectionsData(propertyId: string) {
  return prisma.tenancy.findMany({
    where: { propertyId, status: "ACTIVE" },
    orderBy: { tenant: { fullName: "asc" } },
    select: {
      id: true,
      monthlyRent: true,
      maintenanceCharge: true,
      paymentStatus: true,
      securityDeposit: true,
      depositStatus: true,
      noticeGivenDate: true,
      tenant: {
        select: { id: true, fullName: true, phone: true, email: true, notes: true },
      },
      bed: {
        select: {
          label: true,
          room: {
            select: {
              number: true,
              floor: {
                select: {
                  number: true,
                  name: true,
                  block: { select: { name: true } },
                },
              },
            },
          },
        },
      },
      invoices: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { sentAt: true, createdAt: true },
      },
    },
  });
}

export type CollectionRow = Awaited<ReturnType<typeof getCollectionsData>>[number];
