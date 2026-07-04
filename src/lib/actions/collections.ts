"use server";

import { revalidatePath } from "next/cache";
import { format, parseISO, startOfMonth } from "date-fns";

import { auth } from "@/auth";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { signFileToken } from "@/lib/file-token";
import { generateInvoicePdf } from "@/lib/invoice";
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
import { PAYMENT_STATUS_META } from "@/lib/status";
import { storage } from "@/lib/storage";
import { sendWhatsAppMedia } from "@/lib/twilio";
import { sendInvoiceSchema, type SendInvoiceInput } from "@/lib/validations/invoice";

const isoDate = (d: Date) => format(d, "yyyy-MM-dd");

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

type ViewParts = {
  propertyName: string;
  propertyAddress: string | null;
  propertyPhone: string | null;
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
