"use server";

import { revalidatePath } from "next/cache";
import { format, parseISO, startOfMonth, subMonths } from "date-fns";

import { auth } from "@/auth";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { defaultDueDate, type InvoiceView } from "@/lib/invoice-compute";
import {
  deliverInvoice,
  issueInvoice,
  issueInvoiceForPayment,
  previewInvoice,
} from "@/lib/invoice-delivery";
import { loadCollectedByMonth, refreshPaymentStatus, sumCollected } from "@/lib/ledger";
import { formatINR, rupeesToPaise } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { getActiveProperty } from "@/lib/property";
import { resolvePublicBaseUrl } from "@/lib/public-url";
import { getCollectionsData, type CollectionRow } from "@/lib/queries/collections";
import {
  advancePaise,
  balancePaise,
  earlierDues,
  ledgerStartMonth,
  monthlyDuePaise,
  paymentSplit,
  resolveCollectionState,
  resolvePaymentStatus,
  resolveSplitPaise,
  type RentCollectionView,
} from "@/lib/rent";
import { sendWhatsAppText } from "@/lib/twilio";
import { collectRentSchema, type CollectRentInput } from "@/lib/validations/collections";
import { sendInvoiceSchema, type SendInvoiceInput } from "@/lib/validations/invoice";

/**
 * Parse a `YYYY-MM` billing month into its first day in local time. Returns the current
 * month when omitted, or null when the string is malformed.
 */
function parseBillingMonth(month?: string): Date | null {
  if (!month) return startOfMonth(new Date());
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [year, m] = month.split("-").map(Number);
  return new Date(year, m - 1, 1);
}

/** Every screen that reads the payments ledger or the tenancy payment snapshot. */
function revalidateCollectionViews(tenantId: string) {
  revalidatePath("/collections");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/floor-manager");
  revalidatePath("/tenants");
  revalidatePath(`/tenants/${tenantId}`);
}

/** Unpaid balance a tenancy carries from months before `month`. */
async function earlierDuesFor(
  tenancy: {
    id: string;
    monthlyRent: number;
    maintenanceCharge: number;
    checkInDate: Date;
    createdAt: Date;
  },
  month: Date,
) {
  const start = ledgerStartMonth(tenancy);
  const collected = await loadCollectedByMonth(prisma, [tenancy.id], start, subMonths(month, 1));
  return earlierDues({
    duePaise: monthlyDuePaise(tenancy),
    startMonth: start,
    beforeMonth: month,
    collectedByMonth: collected.get(tenancy.id) ?? new Map(),
  });
}

/**
 * Build the default invoice for an active tenancy and billing month WITHOUT persisting
 * anything. Powers the preview dialog; the staff can then edit the optional fields
 * before sending. Previous due defaults to the unpaid balance from earlier months, and
 * the amount already collected for the month is shown against the total.
 */
export async function prepareInvoice(
  tenancyId: string,
  month?: string,
): Promise<ActionResult<InvoiceView>> {
  const session = await auth();
  if (!session?.user) return actionError("Not authenticated");

  const property = await getActiveProperty();
  if (!property) return actionError("No active property selected");

  const billingMonth = parseBillingMonth(month);
  if (!billingMonth) return actionError("Invalid billing month");

  const tenancy = await prisma.tenancy.findFirst({
    where: { id: tenancyId, propertyId: property.id, status: "ACTIVE" },
    select: {
      id: true,
      monthlyRent: true,
      maintenanceCharge: true,
      paymentDueDay: true,
      checkInDate: true,
      createdAt: true,
    },
  });
  if (!tenancy) return actionError("Active tenancy not found for this property");

  const earlier = await earlierDuesFor(tenancy, billingMonth);
  const view = await previewInvoice(property, tenancy.id, {
    billingMonth,
    dueDate: defaultDueDate(tenancy.paymentDueDay, billingMonth),
    previousDuePaise: earlier.paise,
    extraChargesPaise: 0,
    extraChargesLabel: null,
    discountPaise: 0,
    notes: null,
  });
  if (!view) return actionError("Active tenancy not found for this property");
  return actionOk(view);
}

/**
 * Generate the invoice PDF, persist an Invoice record, store the file, and deliver it
 * over WhatsApp (Twilio). All work is server-side; Twilio credentials never reach the
 * client. The invoice is persisted even if delivery fails, so it can be resent.
 */
export async function sendInvoice(
  input: SendInvoiceInput,
): Promise<ActionResult<{ invoiceId: string; messageSid: string }>> {
  const session = await auth();
  if (!session?.user) return actionError("Not authenticated");

  const property = await getActiveProperty();
  if (!property) return actionError("No active property selected");

  const parsed = sendInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid invoice details");
  }
  const v = parsed.data;

  // Fail fast on the most common Twilio blocker (non-public APP_PUBLIC_URL) before
  // generating or persisting anything — a manual send exists only to be delivered.
  const baseUrl = resolvePublicBaseUrl();
  if (!baseUrl.ok) return actionError(baseUrl.error);

  const tenancy = await prisma.tenancy.findFirst({
    where: { id: v.tenancyId, propertyId: property.id, status: "ACTIVE" },
    select: { id: true, tenantId: true, tenant: { select: { phone: true } } },
  });
  if (!tenancy) return actionError("Active tenancy not found for this property");
  if (!tenancy.tenant.phone) return actionError("Tenant has no phone number on file");

  const result = await issueInvoice({
    property,
    tenancyId: tenancy.id,
    charges: {
      billingMonth: startOfMonth(parseISO(`${v.billingMonth}-01`)),
      dueDate: v.dueDate ? parseISO(v.dueDate) : null,
      previousDuePaise: rupeesToPaise(v.previousDue),
      extraChargesPaise: rupeesToPaise(v.extraCharges),
      extraChargesLabel: v.extraChargesLabel?.trim() || null,
      discountPaise: rupeesToPaise(v.discount),
      notes: v.notes?.trim() || null,
    },
  });

  revalidatePath("/collections");
  if (!result.ok) return actionError(result.error);
  if (!result.delivered || !result.messageSid) {
    return actionError(result.deliveryError ?? "Failed to send the WhatsApp message");
  }
  return actionOk({ invoiceId: result.invoiceId, messageSid: result.messageSid });
}

/** Resend an existing invoice's stored PDF over WhatsApp. */
export async function resendInvoice(
  invoiceId: string,
): Promise<ActionResult<{ messageSid: string }>> {
  const session = await auth();
  if (!session?.user) return actionError("Not authenticated");

  const property = await getActiveProperty();
  if (!property) return actionError("No active property selected");

  const baseUrl = resolvePublicBaseUrl();
  if (!baseUrl.ok) return actionError(baseUrl.error);

  const exists = await prisma.invoice.findFirst({
    where: { id: invoiceId, propertyId: property.id },
    select: { id: true },
  });
  if (!exists) return actionError("Invoice not found");

  const delivery = await deliverInvoice(property, invoiceId);
  revalidatePath("/collections");
  if (!delivery.delivered || !delivery.messageSid) {
    return actionError(delivery.error ?? "Failed to resend the invoice");
  }
  return actionOk({ messageSid: delivery.messageSid });
}

/**
 * Everything the Collect Rent dialog needs for one active tenancy and one billing
 * month: the charges, what has already been collected (with its cash/online split and
 * timestamps), the balance left, and anything still unpaid from earlier months.
 * Read-only — nothing is written.
 */
export async function getRentCollection(
  tenancyId: string,
  month?: string,
): Promise<ActionResult<RentCollectionView>> {
  const session = await auth();
  if (!session?.user) return actionError("Not authenticated");

  const property = await getActiveProperty();
  if (!property) return actionError("No active property selected");

  const forMonth = parseBillingMonth(month);
  if (!forMonth) return actionError("Invalid billing month");

  const tenancy = await prisma.tenancy.findFirst({
    where: { id: tenancyId, propertyId: property.id, status: "ACTIVE" },
    select: {
      id: true,
      monthlyRent: true,
      maintenanceCharge: true,
      paymentDueDay: true,
      checkInDate: true,
      createdAt: true,
      tenant: { select: { fullName: true } },
      bed: { select: { label: true, room: { select: { number: true } } } },
      payments: {
        where: { forMonth, status: "PAID" },
        orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          amount: true,
          method: true,
          cashAmount: true,
          onlineAmount: true,
          paidAt: true,
          createdAt: true,
          notes: true,
          recordedBy: { select: { name: true } },
        },
      },
    },
  });
  if (!tenancy) return actionError("Active tenancy not found for this property");

  const collections = tenancy.payments.map((p) => {
    const { cash, online } = paymentSplit(p);
    return {
      id: p.id,
      amountPaise: p.amount,
      cashPaise: cash,
      onlinePaise: online,
      method: p.method,
      collectedAt: (p.paidAt ?? p.createdAt).toISOString(),
      notes: p.notes,
      recordedBy: p.recordedBy?.name ?? null,
    };
  });

  const duePaise = monthlyDuePaise(tenancy);
  const collectedPaise = collections.reduce((sum, c) => sum + c.amountPaise, 0);
  const earlier = await earlierDuesFor(tenancy, forMonth);

  return actionOk({
    tenancyId: tenancy.id,
    tenantName: tenancy.tenant.fullName,
    room: property.isFlat
      ? `Flat ${tenancy.bed.room.number}`
      : `Room ${tenancy.bed.room.number} · Bed ${tenancy.bed.label}`,
    month: format(forMonth, "yyyy-MM"),
    rentPaise: tenancy.monthlyRent,
    maintenancePaise: tenancy.maintenanceCharge,
    duePaise,
    collectedPaise,
    cashPaise: collections.reduce((sum, c) => sum + c.cashPaise, 0),
    onlinePaise: collections.reduce((sum, c) => sum + c.onlinePaise, 0),
    balancePaise: balancePaise(duePaise, collectedPaise),
    advancePaise: advancePaise(duePaise, collectedPaise),
    paymentDueDay: tenancy.paymentDueDay,
    status: resolvePaymentStatus({
      duePaise,
      collectedPaise,
      paymentDueDay: tenancy.paymentDueDay,
      month: forMonth,
    }),
    state: resolveCollectionState(duePaise, collectedPaise),
    earlierDuePaise: earlier.paise,
    earlierDueMonths: earlier.months,
    firstMonth: format(startOfMonth(tenancy.checkInDate), "yyyy-MM"),
    collections,
  });
}

export type CollectRentResult = {
  paymentId: string;
  balancePaise: number;
  fullyPaid: boolean;
  /** The invoice issued for this collection; null when the staff chose not to send one. */
  invoice: { number: string | null; delivered: boolean; error: string | null } | null;
};

/**
 * Record one rent collection against an active tenancy — the money actually received,
 * how it was received (cash / online / both) and when. A month can take several
 * collections (part payments on different dates), so each one is its own Payment row
 * and `Tenancy.paymentStatus` is re-derived from the month's collected total.
 *
 * Unless the staff opts out, an invoice for the collection (what was received, the
 * month's total, paid so far and the balance) is then issued and sent to the tenant on
 * WhatsApp. The collection is committed FIRST: an invoice or delivery failure is
 * reported but can never lose the record of money received.
 */
export async function collectRent(
  input: CollectRentInput,
): Promise<ActionResult<CollectRentResult>> {
  const session = await auth();
  if (!session?.user?.id) return actionError("Not authenticated");
  const userId = session.user.id;

  const property = await getActiveProperty();
  if (!property) return actionError("No active property selected");

  const parsed = collectRentSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid collection details");
  }
  const v = parsed.data;

  const forMonth = parseBillingMonth(v.forMonth);
  if (!forMonth) return actionError("Invalid billing month");

  const tenancy = await prisma.tenancy.findFirst({
    where: { id: v.tenancyId, propertyId: property.id, status: "ACTIVE" },
    select: {
      id: true,
      tenantId: true,
      monthlyRent: true,
      maintenanceCharge: true,
      paymentDueDay: true,
      checkInDate: true,
    },
  });
  if (!tenancy) return actionError("Active tenancy not found for this property");

  // Rent cannot be owed for a month before the tenant moved in.
  if (forMonth < startOfMonth(tenancy.checkInDate)) {
    return actionError(
      `The tenant moved in on ${format(tenancy.checkInDate, "dd MMM yyyy")} — pick ${format(
        tenancy.checkInDate,
        "MMMM yyyy",
      )} or later.`,
    );
  }

  const amountPaise = rupeesToPaise(v.amount);
  const { cashAmount, onlineAmount } = resolveSplitPaise(
    amountPaise,
    v.method,
    rupeesToPaise(v.cashAmount ?? 0),
    rupeesToPaise(v.onlineAmount ?? 0),
  );
  const collectedAt = new Date(v.collectedAt);

  let paymentId: string;
  let monthCollected: number;
  try {
    ({ paymentId, monthCollected } = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          propertyId: property.id,
          tenancyId: tenancy.id,
          tenantId: tenancy.tenantId,
          amount: amountPaise,
          forMonth,
          status: "PAID",
          method: v.method,
          cashAmount,
          onlineAmount,
          paidAt: collectedAt,
          notes: v.notes || null,
          recordedById: userId,
        },
        select: { id: true },
      });

      // Re-derive the current-cycle snapshot from the ledger, even when this collection
      // settled an older month — the status shown on the Collections and Floor Manager
      // screens always describes today's cycle.
      await refreshPaymentStatus(tx, tenancy);

      return {
        paymentId: payment.id,
        monthCollected: await sumCollected(tx, tenancy.id, forMonth),
      };
    }));
  } catch {
    return actionError("Could not record the collection. Please try again.");
  }

  let invoice: CollectRentResult["invoice"] = null;
  if (v.sendInvoice) {
    try {
      const issued = await issueInvoiceForPayment(property, paymentId);
      invoice = issued.ok
        ? { number: issued.number, delivered: issued.delivered, error: issued.deliveryError }
        : { number: null, delivered: false, error: issued.error };
    } catch (e) {
      invoice = {
        number: null,
        delivered: false,
        error: e instanceof Error ? e.message : "Could not issue the invoice",
      };
    }
  }

  revalidateCollectionViews(tenancy.tenantId);
  const remaining = balancePaise(monthlyDuePaise(tenancy), monthCollected);
  return actionOk({ paymentId, balancePaise: remaining, fullyPaid: remaining === 0, invoice });
}

/**
 * Delete a wrongly entered collection and re-derive the tenancy snapshot. Correcting a
 * receipt has to be possible, or a typo would permanently distort the reports. An
 * invoice already issued for it is kept (its link to the payment is cleared) so the
 * record of what was sent to the tenant survives.
 */
export async function deleteRentCollection(paymentId: string): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return actionError("Not authenticated");
  if (session.user.role !== "ADMIN" && session.user.role !== "MANAGER") {
    return actionError("Only an admin or manager can delete a collection");
  }

  const property = await getActiveProperty();
  if (!property) return actionError("No active property selected");

  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, propertyId: property.id },
    select: {
      id: true,
      tenancyId: true,
      tenantId: true,
      tenancy: {
        select: { id: true, monthlyRent: true, maintenanceCharge: true, paymentDueDay: true },
      },
    },
  });
  if (!payment) return actionError("Collection not found");

  try {
    await prisma.$transaction(async (tx) => {
      await tx.payment.delete({ where: { id: payment.id } });
      await refreshPaymentStatus(tx, { ...payment.tenancy, tenantId: payment.tenantId });
    });
  } catch {
    return actionError("Could not delete the collection. Please try again.");
  }

  revalidateCollectionViews(payment.tenantId);
  return actionOk();
}

// ---------------------------------------------------------------------------------
// Reminders
// ---------------------------------------------------------------------------------

/**
 * Plain-text rent reminder (no PDF, so it needs no public URL). The body is built from
 * the tenant's actual position — this month's collections, the balance left and any
 * earlier unpaid months — so a part-paid tenant is asked for the balance, not the full
 * rent, and a fully paid tenant is never told their rent is pending. Money uses the
 * unicode ₹ (WhatsApp text is unicode, unlike the PDF which uses "Rs.").
 */
function buildReminderBody(row: CollectionRow, propertyName: string, isFlat: boolean): string {
  const room = isFlat
    ? `Flat ${row.bed.room.number}`
    : `Room ${row.bed.room.number} · Bed ${row.bed.label}`;
  const month = format(new Date(`${row.month}-01T00:00:00`), "MMMM yyyy");
  const lines = [`Hi ${row.tenant.fullName},`, ""];

  if (row.outstandingPaise > 0) {
    lines.push(
      `This is a friendly reminder that ${formatINR(row.outstandingPaise)} of your rent for ${room} is pending.`,
      "",
    );
    if (row.balancePaise > 0) {
      lines.push(
        row.collectedPaise > 0
          ? `${month}: ${formatINR(row.collectedPaise)} of ${formatINR(row.duePaise)} paid — ${formatINR(row.balancePaise)} due by ${format(row.dueDate, "dd MMM")}.`
          : `${month}: ${formatINR(row.duePaise)} due by ${format(row.dueDate, "dd MMM")}.`,
      );
    }
    if (row.earlierDuePaise > 0) {
      lines.push(`Earlier months: ${formatINR(row.earlierDuePaise)} unpaid.`);
    }
    lines.push(
      "",
      "Kindly make the payment at your earliest convenience. Please ignore this message if you have already paid.",
    );
  } else {
    lines.push(
      `This is a reminder that your monthly rent for ${room} is ${formatINR(row.duePaise)}, due by the ${format(row.dueDate, "do")} of each month.`,
      "",
      `Your rent for ${month} has already been received in full — thank you!`,
    );
  }

  lines.push("", "Thank you,", propertyName);
  return lines.join("\n");
}

/** Send a reminder to each row, one at a time; one bad number never aborts the batch. */
async function sendReminders(rows: CollectionRow[], propertyName: string, isFlat: boolean) {
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const row of rows) {
    if (!row.tenant.phone) {
      skipped++;
      continue;
    }
    try {
      await sendWhatsAppText({
        to: row.tenant.phone,
        body: buildReminderBody(row, propertyName, isFlat),
      });
      sent++;
    } catch {
      failed++;
    }
  }
  return { sent, failed, skipped };
}

/**
 * Send a single active tenant a plain-text rent reminder over WhatsApp. Refused when
 * nothing is outstanding. Nothing is written to the database.
 */
export async function sendRentReminder(
  tenancyId: string,
): Promise<ActionResult<{ messageSid: string }>> {
  const session = await auth();
  if (!session?.user) return actionError("Not authenticated");

  const property = await getActiveProperty();
  if (!property) return actionError("No active property selected");

  const row = (await getCollectionsData(property.id)).find((r) => r.id === tenancyId);
  if (!row) return actionError("Active tenancy not found for this property");
  if (row.outstandingPaise === 0) return actionError("This tenant has no rent outstanding");
  if (!row.tenant.phone) return actionError("Tenant has no phone number on file");

  try {
    const messageSid = await sendWhatsAppText({
      to: row.tenant.phone,
      body: buildReminderBody(row, property.name, property.isFlat),
    });
    return actionOk({ messageSid });
  } catch (e) {
    return actionError(e instanceof Error ? e.message : "Failed to send the rent reminder");
  }
}

/**
 * Send a rent reminder to every active tenant in the active property. Each message
 * reflects that tenant's own position (see `buildReminderBody`).
 */
export async function remindAllTenants(): Promise<
  ActionResult<{ sent: number; failed: number; skipped: number }>
> {
  const session = await auth();
  if (!session?.user) return actionError("Not authenticated");

  const property = await getActiveProperty();
  if (!property) return actionError("No active property selected");

  const rows = await getCollectionsData(property.id);
  return actionOk(await sendReminders(rows, property.name, property.isFlat));
}

/**
 * Send a rent reminder ONLY to tenants with rent outstanding — an unpaid or part-paid
 * current month, or an unpaid earlier month. Tenants who are fully paid up are left
 * alone.
 */
export async function remindPendingTenants(): Promise<
  ActionResult<{ sent: number; failed: number; skipped: number; eligible: number }>
> {
  const session = await auth();
  if (!session?.user) return actionError("Not authenticated");

  const property = await getActiveProperty();
  if (!property) return actionError("No active property selected");

  const pending = (await getCollectionsData(property.id)).filter((r) => r.outstandingPaise > 0);
  const result = await sendReminders(pending, property.name, property.isFlat);
  return actionOk({ ...result, eligible: pending.length });
}
