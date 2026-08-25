import "server-only";

import { startOfMonth } from "date-fns";

import { prisma } from "@/lib/prisma";
import { balancePaise, monthlyDuePaise, paymentSplit, resolvePaymentStatus } from "@/lib/rent";

/**
 * Every ACTIVE tenancy in the property with the data needed to chase rent
 * collections: tenant contact, location, the current dues / deposit snapshot, and what
 * has actually been collected for the current month (a month can take several part
 * payments, so this is a sum over the ledger rather than a single row).
 */
export async function getCollectionsData(propertyId: string) {
  const month = startOfMonth(new Date());

  const tenancies = await prisma.tenancy.findMany({
    where: { propertyId, status: "ACTIVE" },
    orderBy: { tenant: { fullName: "asc" } },
    select: {
      id: true,
      monthlyRent: true,
      maintenanceCharge: true,
      paymentStatus: true,
      paymentDueDay: true,
      securityDeposit: true,
      depositStatus: true,
      noticeGivenDate: true,
      tenant: {
        select: { id: true, fullName: true, phone: true, email: true },
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
      payments: {
        where: { forMonth: month, status: "PAID" },
        orderBy: { paidAt: "desc" },
        select: { amount: true, method: true, cashAmount: true, onlineAmount: true, paidAt: true },
      },
      invoices: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { sentAt: true, createdAt: true },
      },
    },
  });

  return tenancies.map(({ payments, ...t }) => {
    const collected = payments.reduce((sum, p) => sum + p.amount, 0);
    const due = monthlyDuePaise(t);
    return {
      ...t,
      // Derived from the very numbers shown beside it, so the badge can never claim
      // "Paid" next to an outstanding balance. `Tenancy.paymentStatus` stays the fast
      // snapshot for screens that do not load the ledger (e.g. the Floor Manager).
      status: resolvePaymentStatus({
        duePaise: due,
        collectedPaise: collected,
        paymentDueDay: t.paymentDueDay,
        month,
      }),
      duePaise: due,
      collectedPaise: collected,
      balancePaise: balancePaise(due, collected),
      cashPaise: payments.reduce((sum, p) => sum + paymentSplit(p).cash, 0),
      onlinePaise: payments.reduce((sum, p) => sum + paymentSplit(p).online, 0),
      lastCollectedAt: payments[0]?.paidAt ?? null,
      collectionCount: payments.length,
    };
  });
}

export type CollectionRow = Awaited<ReturnType<typeof getCollectionsData>>[number];
