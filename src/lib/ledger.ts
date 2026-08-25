import "server-only";

import { startOfMonth } from "date-fns";

import type { PaymentMethod, PaymentStatus, Prisma } from "@/generated/prisma/client";
import { monthlyDuePaise, resolvePaymentStatus, resolveSplitPaise } from "@/lib/rent";

/**
 * The payments ledger, in one place. A Payment row is one collection event; a billing
 * month may hold several. Every write path (Collect Rent, the bed form, the tenant
 * profile toggle) goes through here so `Tenancy.paymentStatus` is always DERIVED from
 * what was actually collected instead of being set by hand in three different ways.
 */

export type LedgerTenancy = {
  id: string;
  tenantId: string;
  monthlyRent: number;
  maintenanceCharge: number;
  paymentDueDay: number | null;
};

/** Total collected (status PAID) against one tenancy for one billing month. */
export async function sumCollected(
  tx: Prisma.TransactionClient,
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
 * cannot double-count the rent.
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
): Promise<void> {
  const { propertyId, tenancy, forMonth, method, recordedById, at } = args;

  const shortfall = monthlyDuePaise(tenancy) - (await sumCollected(tx, tenancy.id, forMonth));
  if (shortfall <= 0) return;

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

  await tx.payment.create({
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
  });
}

/**
 * Reverse a month's collections without destroying the receipts: the rows are kept but
 * moved out of PAID, so they stop counting towards the collected total and the reports.
 */
export async function voidMonthCollections(
  tx: Prisma.TransactionClient,
  tenancyId: string,
  forMonth: Date,
  status: Exclude<PaymentStatus, "PAID">,
): Promise<void> {
  await tx.payment.updateMany({
    where: { tenancyId, forMonth, status: "PAID" },
    data: { status, paidAt: null },
  });
}
