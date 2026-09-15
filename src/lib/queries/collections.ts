import "server-only";

import { format, startOfMonth, subMonths } from "date-fns";

import { loadCollectedByMonth } from "@/lib/ledger";
import { prisma } from "@/lib/prisma";
import {
  balancePaise,
  earlierDues,
  ledgerStartMonth,
  monthlyDuePaise,
  paymentSplit,
  rentDueDate,
  resolveCollectionState,
  resolvePaymentStatus,
} from "@/lib/rent";

/**
 * Every ACTIVE tenancy in the property with the data needed to chase rent for one
 * billing month (the current one by default): tenant contact, location, what has been
 * collected for the month (a month can take several part payments, so this is a sum
 * over the ledger rather than a single row), and any unpaid balance carried from
 * earlier months.
 *
 * A tenancy is only listed for months it can owe — from its ledger start month on —
 * so viewing a past month does not show tenants who moved in later as unpaid.
 */
export async function getCollectionsData(propertyId: string, month = startOfMonth(new Date())) {
  const tenancies = await prisma.tenancy.findMany({
    where: { propertyId, status: "ACTIVE" },
    orderBy: { tenant: { fullName: "asc" } },
    select: {
      id: true,
      monthlyRent: true,
      maintenanceCharge: true,
      paymentDueDay: true,
      securityDeposit: true,
      depositStatus: true,
      noticeGivenDate: true,
      checkInDate: true,
      createdAt: true,
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
    },
  });

  const billable = tenancies.filter((t) => ledgerStartMonth(t) <= month);

  // One grouped read covers every earlier month of every tenancy.
  const earliest = billable.reduce<Date | null>((min, t) => {
    const start = ledgerStartMonth(t);
    return !min || start < min ? start : min;
  }, null);
  const history = earliest
    ? await loadCollectedByMonth(
        prisma,
        billable.map((t) => t.id),
        earliest,
        subMonths(month, 1),
      )
    : new Map<string, Map<string, number>>();

  return billable.map(({ payments, createdAt, ...t }) => {
    const collected = payments.reduce((sum, p) => sum + p.amount, 0);
    const due = monthlyDuePaise(t);
    const balance = balancePaise(due, collected);
    const earlier = earlierDues({
      duePaise: due,
      startMonth: ledgerStartMonth({ checkInDate: t.checkInDate, createdAt }),
      beforeMonth: month,
      collectedByMonth: history.get(t.id) ?? new Map(),
    });
    return {
      ...t,
      month: format(month, "yyyy-MM"),
      // Derived from the very numbers shown beside it, so the badge can never claim
      // "Paid" next to an outstanding balance. `Tenancy.paymentStatus` stays the fast
      // snapshot for screens that do not load the ledger (e.g. the Floor Manager).
      status: resolvePaymentStatus({
        duePaise: due,
        collectedPaise: collected,
        paymentDueDay: t.paymentDueDay,
        month,
      }),
      state: resolveCollectionState(due, collected),
      dueDate: rentDueDate(t.paymentDueDay, month),
      // Pre-formatted: a Date crossing the RSC boundary is re-read in the browser's
      // timezone, which can shift a local-midnight date back a day.
      dueDateLabel: format(rentDueDate(t.paymentDueDay, month), "d MMM"),
      duePaise: due,
      collectedPaise: collected,
      balancePaise: balance,
      earlierDuePaise: earlier.paise,
      earlierDueMonths: earlier.months,
      /** Everything owed up to and including this month. */
      outstandingPaise: balance + earlier.paise,
      cashPaise: payments.reduce((sum, p) => sum + paymentSplit(p).cash, 0),
      onlinePaise: payments.reduce((sum, p) => sum + paymentSplit(p).online, 0),
      lastCollectedAt: payments[0]?.paidAt ?? null,
      collectionCount: payments.length,
    };
  });
}

export type CollectionRow = Awaited<ReturnType<typeof getCollectionsData>>[number];
