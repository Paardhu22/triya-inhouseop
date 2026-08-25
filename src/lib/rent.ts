// Rent collection rules shared by server actions, queries and client UI. Pure
// functions only (no Node/Prisma imports) so this is safe to import from client
// components — same pattern as tenancy.ts and invoice-compute.ts.
//
// The ledger model: a Payment row is ONE collection event (a receipt), grouped into a
// billing month by `forMonth`. A month can therefore hold several rows (part cash now,
// part online later). `Tenancy.paymentStatus` is a denormalized snapshot derived from
// the month's collected total via `resolvePaymentStatus` — never set by hand.
import type { PaymentMethod, PaymentStatus } from "@/generated/prisma/client";

export const PAYMENT_METHOD_META: Record<PaymentMethod, { label: string }> = {
  CASH: { label: "Cash" },
  ONLINE: { label: "Online" },
  SPLIT: { label: "Cash + Online" },
};

/** Total a tenancy owes for one month: rent plus the recurring maintenance charge. */
export function monthlyDuePaise(t: { monthlyRent: number; maintenanceCharge: number }): number {
  return t.monthlyRent + t.maintenanceCharge;
}

/**
 * The cash / online split of one collection. `cashAmount` and `onlineAmount` are
 * written on every new row, but older rows predate them — fall back to the method so
 * historical payments still add up in reports.
 */
export function paymentSplit(p: {
  amount: number;
  method: PaymentMethod;
  cashAmount: number | null;
  onlineAmount: number | null;
}): { cash: number; online: number } {
  if (p.cashAmount !== null || p.onlineAmount !== null) {
    return { cash: p.cashAmount ?? 0, online: p.onlineAmount ?? 0 };
  }
  if (p.method === "ONLINE") return { cash: 0, online: p.amount };
  if (p.method === "CASH") return { cash: p.amount, online: 0 };
  return { cash: 0, online: 0 }; // legacy SPLIT with no breakdown recorded
}

/**
 * Normalize a collection into the pair actually stored. CASH and ONLINE put the whole
 * amount on one side; SPLIT keeps what was entered. Guarantees the invariant every
 * report relies on: `cashAmount + onlineAmount === amount`.
 */
export function resolveSplitPaise(
  amountPaise: number,
  method: PaymentMethod,
  cashPaise = 0,
  onlinePaise = 0,
): { cashAmount: number; onlineAmount: number } {
  if (method === "CASH") return { cashAmount: amountPaise, onlineAmount: 0 };
  if (method === "ONLINE") return { cashAmount: 0, onlineAmount: amountPaise };
  return { cashAmount: cashPaise, onlineAmount: onlinePaise };
}

/**
 * The current-cycle snapshot for a tenancy, derived from what has actually been
 * collected for `month`:
 * - PAID once the collected total covers the month's due (or nothing is due),
 * - OVERDUE once the month's due date has passed,
 * - PENDING otherwise.
 *
 * `paymentDueDay` is the day of the month rent is due; without one the whole month is
 * treated as the grace period, so a month only turns OVERDUE after it has ended.
 */
export function resolvePaymentStatus(args: {
  duePaise: number;
  collectedPaise: number;
  paymentDueDay: number | null;
  /** First day of the billed month. */
  month: Date;
  now?: Date;
}): PaymentStatus {
  const { duePaise, collectedPaise, paymentDueDay, month } = args;
  if (duePaise <= 0 || collectedPaise >= duePaise) return "PAID";

  const now = args.now ?? new Date();
  // Last day of `month`, so a null/out-of-range due day clamps to the month end.
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const dueDay = Math.min(paymentDueDay ?? lastDay, lastDay);
  const deadline = new Date(month.getFullYear(), month.getMonth(), dueDay, 23, 59, 59, 999);
  return now > deadline ? "OVERDUE" : "PENDING";
}

/** Balance still owed for a month (never negative — an overpayment is an advance). */
export function balancePaise(duePaise: number, collectedPaise: number): number {
  return Math.max(0, duePaise - collectedPaise);
}

/** Amount collected beyond the month's due, i.e. paid in advance. */
export function advancePaise(duePaise: number, collectedPaise: number): number {
  return Math.max(0, collectedPaise - duePaise);
}

/**
 * One recorded collection, as shown in the Collect Rent dialog. Dates are ISO strings
 * so the shape crosses the server-action boundary unchanged.
 */
export type RentCollectionEntry = {
  id: string;
  amountPaise: number;
  cashPaise: number;
  onlinePaise: number;
  method: PaymentMethod;
  collectedAt: string;
  notes: string | null;
  recordedBy: string | null;
};

/** One tenancy's rent position for a single billing month. */
export type RentCollectionView = {
  tenancyId: string;
  tenantName: string;
  room: string;
  /** Billing month as YYYY-MM. */
  month: string;
  rentPaise: number;
  maintenancePaise: number;
  duePaise: number;
  collectedPaise: number;
  cashPaise: number;
  onlinePaise: number;
  balancePaise: number;
  advancePaise: number;
  paymentDueDay: number | null;
  status: PaymentStatus;
  collections: RentCollectionEntry[];
};
