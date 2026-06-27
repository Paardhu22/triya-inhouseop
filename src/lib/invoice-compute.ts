// Pure, client-safe invoice math + shared shape. No Node/Prisma imports, so the
// server action (authoritative) and the client preview render identical numbers —
// the same pattern as src/lib/tenancy.ts. Money is integer paise throughout.

import { endOfMonth, set, startOfMonth } from "date-fns";

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

/** First day of the current month — the default billed month. */
export function defaultBillingMonth(now = new Date()): Date {
  return startOfMonth(now);
}

/**
 * Default due date within the billed month: the tenancy's payment-due day when set
 * (clamped to the month length), otherwise the 5th.
 */
export function defaultDueDate(paymentDueDay: number | null, billingMonth: Date): Date {
  const wanted = paymentDueDay && paymentDueDay >= 1 && paymentDueDay <= 31 ? paymentDueDay : 5;
  const lastDay = endOfMonth(billingMonth).getDate();
  const day = Math.min(wanted, lastDay);
  return set(billingMonth, { date: day, hours: 0, minutes: 0, seconds: 0, milliseconds: 0 });
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
  notes: string | null;
};
