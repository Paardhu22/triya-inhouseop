import "server-only";

import { prisma } from "@/lib/prisma";

/** The Tenant record linked to a portal login, with what the portal dashboard needs. */
export async function getTenantByUserId(userId: string) {
  return prisma.tenant.findUnique({
    where: { userId },
    select: {
      id: true,
      fullName: true,
      propertyId: true,
      property: { select: { name: true, phone: true } },
      tenancies: {
        where: { status: "ACTIVE" },
        take: 1,
        select: {
          id: true,
          monthlyRent: true,
          maintenanceCharge: true,
          paymentStatus: true,
          paymentDueDay: true,
          bed: { select: { label: true, room: { select: { number: true } } } },
        },
      },
      payments: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, amount: true, forMonth: true, status: true, method: true, paidAt: true },
      },
      invoices: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, number: true, billingMonth: true, totalPaise: true, dueDate: true, status: true },
      },
      complaints: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, title: true, status: true, priority: true, createdAt: true, resolvedAt: true },
      },
    },
  });
}

export type PortalTenant = Awaited<ReturnType<typeof getTenantByUserId>>;
