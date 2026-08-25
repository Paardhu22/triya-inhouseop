"use server";

import { revalidatePath } from "next/cache";
import { format, parseISO, startOfMonth } from "date-fns";

import { auth } from "@/auth";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { signFileToken } from "@/lib/file-token";
import { generateInvoicePdf } from "@/lib/invoice";
import { refreshPaymentStatus, sumCollected } from "@/lib/ledger";
import {
  computeInvoiceTotals,
  defaultBillingMonth,
  defaultDueDate,
  type InvoiceView,
} from "@/lib/invoice-compute";
import { formatINR, rupeesToPaise } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { getActiveProperty } from "@/lib/property";
import { resolvePublicBaseUrl } from "@/lib/public-url";
import {
  advancePaise,
  balancePaise,
  monthlyDuePaise,
  paymentSplit,
  resolvePaymentStatus,
  resolveSplitPaise,
  type RentCollectionView,
} from "@/lib/rent";

import { PAYMENT_STATUS_META } from "@/lib/status";
import { storage } from "@/lib/storage";
import { sendWhatsAppMedia, sendWhatsAppText } from "@/lib/twilio";
import { collectRentSchema, type CollectRentInput } from "@/lib/validations/collections";
import { sendInvoiceSchema, type SendInvoiceInput } from "@/lib/validations/invoice";

const isoDate = (d: Date) => format(d, "yyyy-MM-dd");

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

function formatInvoiceNumber(billingMonth: Date, seq: number): string {
  return `INV-${format(billingMonth, "yyyyMM")}-${String(seq).padStart(4, "0")}`;
}

/** Short-lived signed media URL Twilio can fetch without a session. */
function buildMediaUrl(base: string, storageKey: string): string {
  const { exp, sig } = signFileToken(storageKey, 900);
  return `${base}/api/files/${storageKey}?exp=${exp}&sig=${sig}`;
}

function buildWhatsAppBody(args: {
  tenantName: string;
  billingMonth: Date;
  room: string;
  totalPaise: number;
  dueDate: Date | null;
  propertyName: string;
}): string {
  return [
    `Hello ${args.tenantName},`,
    "",
    `Your rent invoice for ${format(args.billingMonth, "MMMM yyyy")} is attached.`,
    "",
    `Room: ${args.room}`,
    "",
    `Total Amount Due: ${formatINR(args.totalPaise)}`,
    "",
    `Due Date: ${args.dueDate ? format(args.dueDate, "dd MMM yyyy") : "—"}`,
    "",
    "Please complete the payment before the due date.",
    "",
    "Thank you,",
    args.propertyName,
  ].join("\n");
}

/**
 * Short, attachment-free rent reminder body (WhatsApp/SMS style). Unlike an invoice,
 * this carries no PDF — just a friendly nudge to pay the pending rent. Money uses the
 * unicode ₹ (WhatsApp text is unicode, unlike the WinAnsi PDF which needs "Rs.").
 */
function buildReminderBody(args: {
  tenantName: string;
  rentPaise: number;
  roomNumber: string;
  propertyName: string;
}): string {
  return [
    `Hi ${args.tenantName},`,
    "",
    `This is a friendly reminder that your monthly rent of ${formatINR(
      args.rentPaise,
    )} for Room ${args.roomNumber} is pending.`,
    "",
    "Kindly make the payment at your earliest convenience.",
    "",
    "Thank you,",
    args.propertyName,
  ].join("\n");
}

type ViewParts = {
  propertyName: string;
  propertyAddress: string | null;
  propertyPhone: string | null;
  propertyLogoKey: string | null;
  number: string;
  issueDate: Date;
  billingMonth: Date;
  dueDate: Date | null;
  paymentStatusLabel: string;
  tenantName: string;
  tenantPhone: string;
  dateOfJoining: Date;
  roomNumber: string;
  bedLabel: string;
  rentPaise: number;
  maintenancePaise: number;
  previousDuePaise: number;
  extraChargesPaise: number;
  extraChargesLabel: string | null;
  discountPaise: number;
  notes: string | null;
};

/** Assemble the shared InvoiceView (HTML preview + PDF render from the same shape). */
function buildInvoiceView(p: ViewParts): InvoiceView {
  const { subtotalPaise, totalPaise } = computeInvoiceTotals(p);
  return {
    propertyName: p.propertyName,
    propertyAddress: p.propertyAddress,
    propertyPhone: p.propertyPhone,
    propertyLogoKey: p.propertyLogoKey,
    number: p.number,
    issueDate: isoDate(p.issueDate),
    billingMonth: isoDate(p.billingMonth),
    dueDate: p.dueDate ? isoDate(p.dueDate) : null,
    paymentStatusLabel: p.paymentStatusLabel,
    tenantName: p.tenantName,
    tenantPhone: p.tenantPhone,
    dateOfJoining: isoDate(p.dateOfJoining),
    roomNumber: p.roomNumber,
    bedLabel: p.bedLabel,
    rentPaise: p.rentPaise,
    maintenancePaise: p.maintenancePaise,
    previousDuePaise: p.previousDuePaise,
    extraChargesPaise: p.extraChargesPaise,
    extraChargesLabel: p.extraChargesLabel,
    discountPaise: p.discountPaise,
    subtotalPaise,
    totalPaise,
    notes: p.notes,
  };
}

/**
 * Build the default invoice for an active tenancy WITHOUT persisting anything.
 * Powers the preview dialog; the staff can then edit the optional fields before
 * sending. Money is computed server-side so the preview and the final PDF agree.
 */
export async function prepareInvoice(tenancyId: string): Promise<ActionResult<InvoiceView>> {
  const session = await auth();
  if (!session?.user) return actionError("Not authenticated");

  const property = await getActiveProperty();
  if (!property) return actionError("No active property selected");

  const tenancy = await prisma.tenancy.findFirst({
    where: { id: tenancyId, propertyId: property.id, status: "ACTIVE" },
    select: {
      monthlyRent: true,
      maintenanceCharge: true,
      paymentStatus: true,
      paymentDueDay: true,
      checkInDate: true,
      tenant: { select: { fullName: true, phone: true } },
      bed: { select: { label: true, room: { select: { number: true } } } },
    },
  });
  if (!tenancy) return actionError("Active tenancy not found for this property");

  const billingMonth = defaultBillingMonth();
  const dueDate = defaultDueDate(tenancy.paymentDueDay, billingMonth);
  const seq = (await prisma.invoice.count({ where: { propertyId: property.id } })) + 1;

  return actionOk(
    buildInvoiceView({
      propertyName: property.name,
      propertyAddress: property.address,
      propertyPhone: property.phone,
      propertyLogoKey: property.logoKey,
      number: formatInvoiceNumber(billingMonth, seq),
      issueDate: new Date(),
      billingMonth,
      dueDate,
      paymentStatusLabel: PAYMENT_STATUS_META[tenancy.paymentStatus].label,
      tenantName: tenancy.tenant.fullName,
      tenantPhone: tenancy.tenant.phone,
      dateOfJoining: tenancy.checkInDate,
      roomNumber: tenancy.bed.room.number,
      bedLabel: tenancy.bed.label,
      rentPaise: tenancy.monthlyRent,
      maintenancePaise: tenancy.maintenanceCharge,
      previousDuePaise: 0,
      extraChargesPaise: 0,
      extraChargesLabel: null,
      discountPaise: 0,
      notes: null,
    }),
  );
}

/** Reserve a per-property invoice number by creating the row; retry on the rare race. */
async function createInvoiceRow(data: {
  propertyId: string;
  tenancyId: string;
  tenantId: string;
  billingMonth: Date;
  dueDate: Date | null;
  notes: string | null;
  extraChargesLabel: string | null;
  rentPaise: number;
  maintenancePaise: number;
  previousDuePaise: number;
  extraChargesPaise: number;
  discountPaise: number;
  subtotalPaise: number;
  totalPaise: number;
}) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const count = await prisma.invoice.count({ where: { propertyId: data.propertyId } });
    const number = formatInvoiceNumber(data.billingMonth, count + 1);
    try {
      // Created as FAILED (= not yet delivered) and flipped to SENT once Twilio
      // accepts it. storageKey is filled in immediately after the PDF is stored.
      return await prisma.invoice.create({
        data: {
          propertyId: data.propertyId,
          tenancyId: data.tenancyId,
          tenantId: data.tenantId,
          number,
          billingMonth: data.billingMonth,
          dueDate: data.dueDate ?? undefined,
          rentPaise: data.rentPaise,
          maintenancePaise: data.maintenancePaise,
          previousDuePaise: data.previousDuePaise,
          extraChargesPaise: data.extraChargesPaise,
          extraChargesLabel: data.extraChargesLabel ?? undefined,
          discountPaise: data.discountPaise,
          subtotalPaise: data.subtotalPaise,
          totalPaise: data.totalPaise,
          notes: data.notes ?? undefined,
          storageKey: "",
          status: "FAILED",
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002" && attempt < 4) continue;
      throw e;
    }
  }
  throw new Error("Could not allocate an invoice number");
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
  // generating or persisting anything.
  const baseUrl = resolvePublicBaseUrl();
  if (!baseUrl.ok) return actionError(baseUrl.error);

  const tenancy = await prisma.tenancy.findFirst({
    where: { id: v.tenancyId, propertyId: property.id, status: "ACTIVE" },
    select: {
      id: true,
      tenantId: true,
      monthlyRent: true,
      maintenanceCharge: true,
      paymentStatus: true,
      checkInDate: true,
      tenant: { select: { fullName: true, phone: true } },
      bed: { select: { label: true, room: { select: { number: true } } } },
    },
  });
  if (!tenancy) return actionError("Active tenancy not found for this property");
  if (!tenancy.tenant.phone) return actionError("Tenant has no phone number on file");

  const billingMonth = startOfMonth(parseISO(`${v.billingMonth}-01`));
  const dueDate = v.dueDate ? parseISO(v.dueDate) : null;
  const extraChargesLabel = v.extraChargesLabel?.trim() || null;
  const notes = v.notes?.trim() || null;

  const charges = {
    rentPaise: tenancy.monthlyRent,
    maintenancePaise: tenancy.maintenanceCharge,
    previousDuePaise: rupeesToPaise(v.previousDue),
    extraChargesPaise: rupeesToPaise(v.extraCharges),
    discountPaise: rupeesToPaise(v.discount),
  };
  const { subtotalPaise, totalPaise } = computeInvoiceTotals(charges);

  // 1. Reserve the invoice number / row.
  let invoice;
  try {
    invoice = await createInvoiceRow({
      propertyId: property.id,
      tenancyId: tenancy.id,
      tenantId: tenancy.tenantId,
      billingMonth,
      dueDate,
      notes,
      extraChargesLabel,
      ...charges,
      subtotalPaise,
      totalPaise,
    });
  } catch {
    return actionError("Could not allocate an invoice number. Please try again.");
  }

  const view = buildInvoiceView({
    propertyName: property.name,
    propertyAddress: property.address,
    propertyPhone: property.phone,
    propertyLogoKey: property.logoKey,
    number: invoice.number,
    issueDate: invoice.issueDate,
    billingMonth,
    dueDate,
    paymentStatusLabel: PAYMENT_STATUS_META[tenancy.paymentStatus].label,
    tenantName: tenancy.tenant.fullName,
    tenantPhone: tenancy.tenant.phone,
    dateOfJoining: tenancy.checkInDate,
    roomNumber: tenancy.bed.room.number,
    bedLabel: tenancy.bed.label,
    ...charges,
    extraChargesLabel,
    notes,
  });

  // 2. Render + store the PDF; if this fails, drop the reserved row (no orphan).
  let storageKey: string;
  try {
    const pdfBytes = await generateInvoicePdf(view);
    const bytes = new Uint8Array(pdfBytes.byteLength);
    bytes.set(pdfBytes);
    const file = new File([bytes], `${invoice.number}.pdf`, { type: "application/pdf" });
    const saved = await storage.save(file, "invoices");
    storageKey = saved.key;
    await prisma.invoice.update({ where: { id: invoice.id }, data: { storageKey } });
  } catch (e) {
    await prisma.invoice.delete({ where: { id: invoice.id } }).catch(() => {});
    return actionError(e instanceof Error ? e.message : "Could not generate the invoice PDF");
  }

  // 3. Deliver over WhatsApp. Keep the row (FAILED) on failure so it can be resent.
  try {
    const mediaUrl = buildMediaUrl(baseUrl.base, storageKey);
    console.info("[invoice] media prepared", storageKey);
    const messageSid = await sendWhatsAppMedia({
      to: tenancy.tenant.phone,
      body: buildWhatsAppBody({
        tenantName: tenancy.tenant.fullName,
        billingMonth,
        room: `${tenancy.bed.room.number} · Bed ${tenancy.bed.label}`,
        totalPaise,
        dueDate,
        propertyName: property.name,
      }),
      mediaUrl,
    });
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "SENT", messageSid, sentAt: new Date() },
    });
    revalidatePath("/collections");
    return actionOk({ invoiceId: invoice.id, messageSid });
  } catch (e) {
    revalidatePath("/collections");
    return actionError(e instanceof Error ? e.message : "Failed to send the WhatsApp message");
  }
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

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, propertyId: property.id },
    select: {
      id: true,
      storageKey: true,
      billingMonth: true,
      dueDate: true,
      totalPaise: true,
      tenant: { select: { fullName: true, phone: true } },
      tenancy: { select: { bed: { select: { label: true, room: { select: { number: true } } } } } },
    },
  });
  if (!invoice) return actionError("Invoice not found");
  if (!invoice.storageKey) return actionError("This invoice has no stored PDF to resend");
  if (!invoice.tenant.phone) return actionError("Tenant has no phone number on file");

  try {
    const mediaUrl = buildMediaUrl(baseUrl.base, invoice.storageKey);
    console.info("[invoice] media prepared (resend)", invoice.storageKey);
    const messageSid = await sendWhatsAppMedia({
      to: invoice.tenant.phone,
      body: buildWhatsAppBody({
        tenantName: invoice.tenant.fullName,
        billingMonth: invoice.billingMonth,
        room: `${invoice.tenancy.bed.room.number} · Bed ${invoice.tenancy.bed.label}`,
        totalPaise: invoice.totalPaise,
        dueDate: invoice.dueDate,
        propertyName: property.name,
      }),
      mediaUrl,
    });
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "SENT", messageSid, sentAt: new Date() },
    });
    revalidatePath("/collections");
    return actionOk({ messageSid });
  } catch (e) {
    return actionError(e instanceof Error ? e.message : "Failed to resend the invoice");
  }
}

/**
 * Everything the Collect Rent dialog needs for one active tenancy and one billing
 * month: the charges, what has already been collected (with its cash/online split and
 * timestamps), and the balance left. Read-only — nothing is written.
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
    collections,
  });
}

/**
 * Record one rent collection against an active tenancy — the money actually received,
 * how it was received (cash / online / both) and when. Replaces the old blunt
 * "mark as paid": a month can take several collections, so each one is its own Payment
 * row and `Tenancy.paymentStatus` is re-derived from the month's collected total rather
 * than flipped by hand.
 *
 * Collecting for a past month settles that month's ledger but always leaves the
 * tenancy's snapshot describing the CURRENT cycle, which is what the app displays.
 */
export async function collectRent(
  input: CollectRentInput,
): Promise<ActionResult<{ paymentId: string; balancePaise: number; fullyPaid: boolean }>> {
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
    },
  });
  if (!tenancy) return actionError("Active tenancy not found for this property");

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

  revalidateCollectionViews(tenancy.tenantId);
  const remaining = balancePaise(monthlyDuePaise(tenancy), monthCollected);
  return actionOk({ paymentId, balancePaise: remaining, fullyPaid: remaining === 0 });
}

/**
 * Delete a wrongly entered collection and re-derive the tenancy snapshot. Correcting a
 * receipt has to be possible, or a typo would permanently distort the reports.
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

/**
 * Send a single active tenant a plain-text rent reminder over WhatsApp. Independent of
 * invoices: no PDF is generated or persisted, so this needs no public URL. Nothing is
 * written to the database — a reminder is a transient nudge, not a billing record.
 */
export async function sendRentReminder(
  tenancyId: string,
): Promise<ActionResult<{ messageSid: string }>> {
  const session = await auth();
  if (!session?.user) return actionError("Not authenticated");

  const property = await getActiveProperty();
  if (!property) return actionError("No active property selected");

  const tenancy = await prisma.tenancy.findFirst({
    where: { id: tenancyId, propertyId: property.id, status: "ACTIVE" },
    select: {
      monthlyRent: true,
      tenant: { select: { fullName: true, phone: true } },
      bed: { select: { room: { select: { number: true } } } },
    },
  });
  if (!tenancy) return actionError("Active tenancy not found for this property");
  if (!tenancy.tenant.phone) return actionError("Tenant has no phone number on file");

  try {
    const messageSid = await sendWhatsAppText({
      to: tenancy.tenant.phone,
      body: buildReminderBody({
        tenantName: tenancy.tenant.fullName,
        rentPaise: tenancy.monthlyRent,
        roomNumber: tenancy.bed.room.number,
        propertyName: property.name,
      }),
    });
    return actionOk({ messageSid });
  } catch (e) {
    return actionError(e instanceof Error ? e.message : "Failed to send the rent reminder");
  }
}

/**
 * Send the same plain-text rent reminder to every active tenant in the active property,
 * one message at a time. Never throws for an individual tenant: a missing phone number
 * is skipped and a Twilio failure is counted so one bad number can't abort the batch.
 */
export async function remindAllTenants(): Promise<
  ActionResult<{ sent: number; failed: number; skipped: number }>
> {
  const session = await auth();
  if (!session?.user) return actionError("Not authenticated");

  const property = await getActiveProperty();
  if (!property) return actionError("No active property selected");

  const tenancies = await prisma.tenancy.findMany({
    where: { propertyId: property.id, status: "ACTIVE" },
    select: {
      monthlyRent: true,
      tenant: { select: { fullName: true, phone: true } },
      bed: { select: { room: { select: { number: true } } } },
    },
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const t of tenancies) {
    if (!t.tenant.phone) {
      skipped++;
      continue;
    }
    try {
      await sendWhatsAppText({
        to: t.tenant.phone,
        body: buildReminderBody({
          tenantName: t.tenant.fullName,
          rentPaise: t.monthlyRent,
          roomNumber: t.bed.room.number,
          propertyName: property.name,
        }),
      });
      sent++;
    } catch {
      failed++;
    }
  }

  return actionOk({ sent, failed, skipped });
}
