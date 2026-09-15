// Rent collection rules shared by server actions, queries and client UI. Pure
// functions only (no Node/Prisma imports) so this is safe to import from client
// components — same pattern as tenancy.ts and invoice-compute.ts.
//
// The ledger model: a Payment row is ONE collection event (a receipt), grouped into a
// billing month by `forMonth`. A month can therefore hold several rows (part cash now,
// part online later). `Tenancy.paymentStatus` is a denormalized snapshot derived from
// the month's collected total via `resolvePaymentStatus` — never set by hand.
import { addMonths, format, startOfMonth } from "date-fns";

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

/** Day of the month rent falls due when a tenancy has no `paymentDueDay` of its own. */
export const DEFAULT_DUE_DAY = 5;

/**
 * The day a billing month's rent falls due: the tenancy's `paymentDueDay` (clamped to
 * the month's length), else the 5th. The single definition shared by the status
 * snapshot, invoices, reminders and the tenant profile, so an invoice can never print
 * "due 5 Sep" while the status still says Pending on the 20th.
 */
export function rentDueDate(paymentDueDay: number | null, month: Date): Date {
  const wanted =
    paymentDueDay && paymentDueDay >= 1 && paymentDueDay <= 31 ? paymentDueDay : DEFAULT_DUE_DAY;
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return new Date(month.getFullYear(), month.getMonth(), Math.min(wanted, lastDay));
}

/**
 * The current-cycle snapshot for a tenancy, derived from what has actually been
 * collected for `month`:
 * - PAID once the collected total covers the month's due (or nothing is due),
 * - OVERDUE once the month's due date (see `rentDueDate`) has passed,
 * - PENDING otherwise.
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
  const deadline = rentDueDate(paymentDueDay, month);
  deadline.setHours(23, 59, 59, 999);
  return now > deadline ? "OVERDUE" : "PENDING";
}

/**
 * How much of a month has been collected, independent of the due date:
 * - PAID once the collected total covers the due (or nothing is due),
 * - PARTIAL when something, but not all, has come in,
 * - UNPAID when nothing has been collected.
 *
 * Orthogonal to `resolvePaymentStatus`: a PARTIAL month can still be OVERDUE.
 */
export type CollectionState = "PAID" | "PARTIAL" | "UNPAID";

export function resolveCollectionState(duePaise: number, collectedPaise: number): CollectionState {
  if (duePaise <= 0 || collectedPaise >= duePaise) return "PAID";
  return collectedPaise > 0 ? "PARTIAL" : "UNPAID";
}

/** The payment filters offered on list screens (Collections, Tenants, Reports). */
export const PAYMENT_FILTER_OPTIONS = [
  { value: "ALL", label: "All payments" },
  { value: "UNPAID", label: "Unpaid" },
  { value: "PARTIAL", label: "Partially paid" },
  { value: "PAID", label: "Fully paid" },
  { value: "OVERDUE", label: "Overdue" },
] as const;

export type PaymentFilter = (typeof PAYMENT_FILTER_OPTIONS)[number]["value"];

export function matchesPaymentFilter(
  filter: PaymentFilter,
  row: { state: CollectionState; status: PaymentStatus },
): boolean {
  if (filter === "ALL") return true;
  if (filter === "OVERDUE") return row.status === "OVERDUE";
  return row.state === filter;
}

/** Billing-month key (`YYYY-MM`) used to join ledger sums across the RSC boundary. */
export const monthKey = (d: Date) => format(d, "yyyy-MM");

/**
 * The first billing month the app can hold a tenancy to account for: the later of its
 * check-in month and the month it was entered into the app. Tenancies imported with a
 * years-old check-in date must not suddenly owe every month before they were imported.
 */
export function ledgerStartMonth(t: { checkInDate: Date; createdAt: Date }): Date {
  const checkIn = startOfMonth(t.checkInDate);
  const created = startOfMonth(t.createdAt);
  return checkIn > created ? checkIn : created;
}

/**
 * Unpaid balance carried from months before `beforeMonth`: every month from the
 * tenancy's ledger start up to (not including) `beforeMonth` whose collections fall
 * short of the monthly due. Uses the tenancy's CURRENT rent for every month, the same
 * assumption the Collect Rent dialog makes when a past month is selected.
 */
export function earlierDues(args: {
  duePaise: number;
  startMonth: Date;
  beforeMonth: Date;
  /** PAID collections per `monthKey`. */
  collectedByMonth: Map<string, number>;
}): { paise: number; months: string[] } {
  const { duePaise, beforeMonth, collectedByMonth } = args;
  let paise = 0;
  const months: string[] = [];
  if (duePaise <= 0) return { paise, months };
  for (let m = startOfMonth(args.startMonth); m < beforeMonth; m = addMonths(m, 1)) {
    const key = monthKey(m);
    const short = duePaise - (collectedByMonth.get(key) ?? 0);
    if (short > 0) {
      paise += short;
      months.push(key);
    }
  }
  return { paise, months };
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
  state: CollectionState;
  /** Unpaid balance from months before this one, and which months (YYYY-MM). */
  earlierDuePaise: number;
  earlierDueMonths: string[];
  /** First billing month that can be collected for (YYYY-MM). */
  firstMonth: string;
  collections: RentCollectionEntry[];
};
