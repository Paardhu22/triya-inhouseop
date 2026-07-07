import "server-only";

import { prisma } from "@/lib/prisma";

export async function getTenants(propertyId: string) {
  return prisma.tenant.findMany({
    where: { propertyId },
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      phone: true,
      email: true,
      occupation: true,
      college: true,
      company: true,
      createdAt: true,
      photoUrl: true,
      tenancies: {
        where: { status: "ACTIVE" },
        take: 1,
        select: {
          paymentStatus: true,
          monthlyRent: true,
          securityDeposit: true,
          depositStatus: true,
          checkInDate: true,
          bed: { select: { label: true, room: { select: { number: true } } } },
        },
      },
    },
  });
}

export async function getTenantProfile(tenantId: string, propertyId: string) {
  return prisma.tenant.findFirst({
    where: { id: tenantId, propertyId },
    select: {
      id: true,
      fullName: true,
      phone: true,
      email: true,
      emergencyContact: true,
      fatherName: true,
      motherName: true,
      address: true,
      aadhaarNumber: true,
      panNumber: true,
      college: true,
      company: true,
      occupation: true,
      notes: true,
      photoUrl: true,
      createdAt: true,
      tenancies: {
        orderBy: { checkInDate: "desc" },
        select: {
          id: true,
          status: true,
          monthlyRent: true,
          securityDeposit: true,
          paymentStatus: true,
          paymentDueDay: true,
          checkInDate: true,
          expectedLeavingDate: true,
          checkOutDate: true,
          bed: { select: { label: true, room: { select: { number: true } } } },
        },
      },
      documents: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          filename: true,
          storageKey: true,
          mimeType: true,
          createdAt: true,
        },
      },
      payments: {
        orderBy: { forMonth: "desc" },
        take: 12,
        select: {
          id: true,
          amount: true,
          forMonth: true,
          status: true,
          method: true,
          cashAmount: true,
          onlineAmount: true,
          recordedBy: { select: { name: true } },
          paidAt: true,
          notes: true,
        },
      },
      complaints: {
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, status: true, priority: true, createdAt: true },
      },
    },
  });
}

export type TenantListItem = Awaited<ReturnType<typeof getTenants>>[number];
export type TenantProfile = NonNullable<Awaited<ReturnType<typeof getTenantProfile>>>;
