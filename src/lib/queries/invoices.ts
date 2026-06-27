import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * Recent invoices for the property, newest first, with the tenant + location needed
 * to render the history table. Capped so the page never loads an unbounded list.
 */
export async function getInvoiceHistory(propertyId: string) {
  return prisma.invoice.findMany({
    where: { propertyId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      number: true,
      billingMonth: true,
      dueDate: true,
      totalPaise: true,
      status: true,
      sentAt: true,
      createdAt: true,
      storageKey: true,
      tenant: { select: { fullName: true } },
      tenancy: {
        select: { bed: { select: { label: true, room: { select: { number: true } } } } },
      },
    },
  });
}

export type InvoiceHistoryRow = Awaited<ReturnType<typeof getInvoiceHistory>>[number];
