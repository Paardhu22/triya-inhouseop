// Pure, client-safe invoice math + shared shape. No Node/Prisma imports, so the
// server action (authoritative) and the client preview render identical numbers —
// the same pattern as src/lib/tenancy.ts. Money is integer paise throughout.

import { startOfMonth } from "date-fns";

import { rentDueDate } from "@/lib/rent";

/** The five raw charge components, in paise. */
export type InvoiceChargesPaise = {
  rentPaise: number;
  maintenancePaise: number;
  previousDuePaise: number;
  extraChargesPaise: number;
  discountPaise: number;
};

/** Subtotal = rent + maintenance + previous due + extra; total = subtotal − discount. */
export function computeInvoiceTotals(c: InvoiceChargesPaise): {
  subtotalPaise: number;
  totalPaise: number;
} {
  const subtotalPaise =
    c.rentPaise + c.maintenancePaise + c.previousDuePaise + c.extraChargesPaise;
  const totalPaise = Math.max(0, subtotalPaise - c.discountPaise);
  return { subtotalPaise, totalPaise };
}

/** What is still owed on an invoice after the month's collections so far. */
export function invoiceBalancePaise(totalPaise: number, paidPaise: number): number {
  return Math.max(0, totalPaise - paidPaise);
}

/**
 * The status printed on an invoice, derived from its own numbers so it can never say
 * "Pending" next to a zero balance. `dueLabel` is the Pending/Overdue label used when
 * nothing has been collected.
 */
export function invoiceStatusLabel(args: {
  totalPaise: number;
  paidPaise: number;
  dueLabel: string;
}): string {
  if (invoiceBalancePaise(args.totalPaise, args.paidPaise) === 0) return "Paid";
  return args.paidPaise > 0 ? "Partially paid" : args.dueLabel;
}

/** First day of the current month — the default billed month. */
export function defaultBillingMonth(now = new Date()): Date {
  return startOfMonth(now);
}

/**
 * Default due date within the billed month — the same date the payment status turns
 * Overdue on (see `rentDueDate` in rent.ts).
 */
export function defaultDueDate(paymentDueDay: number | null, billingMonth: Date): Date {
  return rentDueDate(paymentDueDay, billingMonth);
}

/**
 * Everything needed to render an invoice identically as HTML (preview) and PDF.
 * Dates are date-only ISO strings ("YYYY-MM-DD") to stay serialization-safe across
 * the server-action boundary and to drop straight into <input type="date">.
 */
export type InvoiceView = {
  // Property
  propertyName: string;
  propertyAddress: string | null;
  propertyPhone: string | null;
  propertyLogoKey: string | null; // storage key for the property logo, or null → brand logo
  // Invoice meta
  number: string;
  issueDate: string;
  billingMonth: string; // first day of the billed month
  dueDate: string | null;
  paymentStatusLabel: string; // dues status shown on the invoice (Paid/Pending/Overdue)
  // Tenant
  tenantName: string;
  tenantPhone: string;
  dateOfJoining: string;
  roomNumber: string;
  bedLabel: string;
  // Charges (paise)
  rentPaise: number;
  maintenancePaise: number;
  previousDuePaise: number;
  extraChargesPaise: number;
  extraChargesLabel: string | null;
  discountPaise: number;
  subtotalPaise: number;
  totalPaise: number;
  /** Collected against the billing month so far (every part payment). */
  paidPaise: number;
  /** max(0, total − paid). */
  balancePaise: number;
  /** The collection this invoice was issued for; null on a bill sent before payment. */
  payment: {
    amountPaise: number;
    methodLabel: string;
    cashPaise: number;
    onlinePaise: number;
    collectedAt: string; // YYYY-MM-DD
  } | null;
  notes: string | null;
};
