import "server-only";

import { startOfMonth } from "date-fns";

import type { PaymentMethod, PaymentStatus, Prisma } from "@/generated/prisma/client";
import { monthKey, monthlyDuePaise, resolvePaymentStatus, resolveSplitPaise } from "@/lib/rent";

/**
 * The payments ledger, in one place. A Payment row is one collection event; a billing
 * month may hold several. Every write path (Collect Rent, the bed form, the importer)
 * goes through here so `Tenancy.paymentStatus` is always DERIVED from what was
 * actually collected instead of being set by hand in different ways.
 */

export type LedgerTenancy = {
  id: string;
  tenantId: string;
  monthlyRent: number;
  maintenanceCharge: number;
  paymentDueDay: number | null;
};

/** Anything that can read payments — the Prisma client or a transaction. */
type PaymentReader = Pick<Prisma.TransactionClient, "payment">;

/** Total collected (status PAID) against one tenancy for one billing month. */
export async function sumCollected(
  tx: PaymentReader,
  tenancyId: string,
  forMonth: Date,
): Promise<number> {
  const agg = await tx.payment.aggregate({
    where: { tenancyId, forMonth, status: "PAID" },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

/**
 * PAID collections per tenancy per billing month (`monthKey`), for every month in
 * `[from, to]`. One grouped read, so a whole property's arrears cost a single query.
 */
export async function loadCollectedByMonth(
  db: PaymentReader,
  tenancyIds: string[],
  from: Date,
  to: Date,
): Promise<Map<string, Map<string, number>>> {
  const result = new Map<string, Map<string, number>>();
  if (tenancyIds.length === 0 || from > to) return result;

  const rows = await db.payment.groupBy({
    by: ["tenancyId", "forMonth"],
    where: {
      status: "PAID",
      tenancyId: { in: tenancyIds },
      forMonth: { gte: startOfMonth(from), lte: startOfMonth(to) },
    },
    _sum: { amount: true },
  });
  for (const row of rows) {
    const months = result.get(row.tenancyId) ?? new Map<string, number>();
    const key = monthKey(row.forMonth);
    months.set(key, (months.get(key) ?? 0) + (row._sum.amount ?? 0));
    result.set(row.tenancyId, months);
  }
  return result;
}

/**
 * Re-derive and store the tenancy's current-cycle payment snapshot. Always reads the
 * CURRENT month, even when the write that triggered it settled an older one — the
 * snapshot on the bed / collections row describes today's cycle.
 */
export async function refreshPaymentStatus(
  tx: Prisma.TransactionClient,
  tenancy: LedgerTenancy,
  now = new Date(),
): Promise<PaymentStatus> {
  const month = startOfMonth(now);
  const status = resolvePaymentStatus({
    duePaise: monthlyDuePaise(tenancy),
    collectedPaise: await sumCollected(tx, tenancy.id, month),
    paymentDueDay: tenancy.paymentDueDay,
    month,
    now,
  });
  await tx.tenancy.update({ where: { id: tenancy.id }, data: { paymentStatus: status } });
  return status;
}

/**
 * Settle a billing month by recording whatever is still outstanding as one collection.
 * A no-op when the month is already covered, so re-saving a form that says "Paid"
 * cannot double-count the rent. Returns the new payment's id, or null when nothing
 * was recorded.
 */
export async function settleMonth(
  tx: Prisma.TransactionClient,
  args: {
    propertyId: string;
    tenancy: LedgerTenancy;
    forMonth: Date;
    method: PaymentMethod;
    /** Split entered by the staff, in paise. Ignored unless `method` is SPLIT. */
    cashPaise?: number;
    onlinePaise?: number;
    recordedById: string;
    at: Date;
  },
): Promise<string | null> {
  const { propertyId, tenancy, forMonth, method, recordedById, at } = args;

  const shortfall = monthlyDuePaise(tenancy) - (await sumCollected(tx, tenancy.id, forMonth));
  if (shortfall <= 0) return null;

  // The entered split is validated against the full month's due. When part of the
  // month was already collected we only record the remainder, so re-apportion it —
  // cash first — rather than storing a split that does not add up to the amount.
  let cash = args.cashPaise ?? 0;
  let online = args.onlinePaise ?? 0;
  if (method === "SPLIT" && cash + online !== shortfall) {
    cash = Math.min(cash, shortfall);
    online = shortfall - cash;
  }
  const split = resolveSplitPaise(shortfall, method, cash, online);

  const payment = await tx.payment.create({
    data: {
      propertyId,
      tenancyId: tenancy.id,
      tenantId: tenancy.tenantId,
      amount: shortfall,
      forMonth,
      status: "PAID",
      method,
      cashAmount: split.cashAmount,
      onlineAmount: split.onlineAmount,
      paidAt: at,
      recordedById,
    },
    select: { id: true },
  });
  return payment.id;
}
