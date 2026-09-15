import "server-only";

import { format, subMonths } from "date-fns";

import type { PaymentMethod, Prisma } from "@/generated/prisma/client";
import { signFileToken } from "@/lib/file-token";
import { generateInvoicePdf } from "@/lib/invoice";
import {
  computeInvoiceTotals,
  defaultDueDate,
  invoiceBalancePaise,
  invoiceStatusLabel,
  type InvoiceView,
} from "@/lib/invoice-compute";
import { loadCollectedByMonth, sumCollected } from "@/lib/ledger";
import { formatINR } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { resolvePublicBaseUrl } from "@/lib/public-url";
import {
  earlierDues,
  ledgerStartMonth,
  monthlyDuePaise,
  paymentSplit,
  PAYMENT_METHOD_META,
  resolvePaymentStatus,
} from "@/lib/rent";
import { PAYMENT_STATUS_META } from "@/lib/status";
import { storage } from "@/lib/storage";
import { sendWhatsAppMedia } from "@/lib/twilio";

/**
 * Issuing and delivering rent invoices. Two callers share this pipeline:
 * - the manual "Send Invoice" bill (actions/collections.ts `sendInvoice`), and
 * - the automatic invoice issued for every recorded collection (`collectRent`, and a
 *   bed saved as Paid in the Floor Manager).
 *
 * Issuing is staged so a failure never orphans data: (1) reserve the row + number,
 * (2) render and store the PDF — the reserved row is deleted if this fails, (3) send on
 * WhatsApp — a failed send keeps the row as FAILED with `lastError`, so it can be
 * resent from Invoice History.
 */

export type InvoiceProperty = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  logoKey: string | null;
  isFlat: boolean;
};

export type InvoiceCharges = {
  billingMonth: Date;
  dueDate: Date | null;
  previousDuePaise: number;
  extraChargesPaise: number;
  extraChargesLabel: string | null;
  discountPaise: number;
  notes: string | null;
};

export type IssueInvoiceResult =
  | {
      ok: true;
      invoiceId: string;
      number: string;
      delivered: boolean;
      messageSid: string | null;
      /** Why WhatsApp delivery did not happen, when `delivered` is false. */
      deliveryError: string | null;
    }
  | { ok: false; error: string };

const isoDate = (d: Date) => format(d, "yyyy-MM-dd");

/** Money for text that is also printed in the PDF, which uses "Rs." rather than ₹. */
const rsText = (paise: number) => formatINR(paise).replace("₹", "Rs. ");

export function formatInvoiceNumber(billingMonth: Date, seq: number): string {
  return `INV-${format(billingMonth, "yyyyMM")}-${String(seq).padStart(4, "0")}`;
}

/** Short-lived signed media URL Twilio can fetch without a session. */
function buildMediaUrl(base: string, storageKey: string): string {
  const { exp, sig } = signFileToken(storageKey, 900);
  return `${base}/api/files/${storageKey}?exp=${exp}&sig=${sig}`;
}

function unitLabel(isFlat: boolean, room: string, bed: string): string {
  return isFlat ? `Flat ${room}` : `Room ${room} · Bed ${bed}`;
}

/**
 * Load everything an invoice needs and compute its numbers. `paidPaise` is read from
 * the ledger at the moment of issue, so an invoice issued after a part payment shows
 * that payment and the balance left.
 */
async function composeInvoice(
  property: InvoiceProperty,
  tenancyId: string,
  charges: InvoiceCharges,
  paymentId: string | null,
) {
  const tenancy = await prisma.tenancy.findFirst({
    where: { id: tenancyId, propertyId: property.id },
    select: {
      id: true,
      tenantId: true,
      monthlyRent: true,
      maintenanceCharge: true,
      paymentDueDay: true,
      checkInDate: true,
      tenant: { select: { fullName: true, phone: true } },
      bed: { select: { label: true, room: { select: { number: true } } } },
    },
  });
  if (!tenancy) return null;

  const payment = paymentId
    ? await prisma.payment.findFirst({
        where: { id: paymentId, tenancyId, status: "PAID" },
        select: {
          id: true,
          amount: true,
          method: true,
          cashAmount: true,
          onlineAmount: true,
          paidAt: true,
          createdAt: true,
        },
      })
    : null;

  const rentPaise = tenancy.monthlyRent;
  const maintenancePaise = tenancy.maintenanceCharge;
  const { subtotalPaise, totalPaise } = computeInvoiceTotals({ rentPaise, maintenancePaise, ...charges });
  const paidPaise = await sumCollected(prisma, tenancy.id, charges.billingMonth);
  const dueStatus = resolvePaymentStatus({
    duePaise: totalPaise,
    collectedPaise: paidPaise,
    paymentDueDay: tenancy.paymentDueDay,
    month: charges.billingMonth,
  });

  const view = (number: string, issueDate: Date): InvoiceView => ({
    propertyName: property.name,
    propertyAddress: property.address,
    propertyPhone: property.phone,
    propertyLogoKey: property.logoKey,
    number,
    issueDate: isoDate(issueDate),
    billingMonth: isoDate(charges.billingMonth),
    dueDate: charges.dueDate ? isoDate(charges.dueDate) : null,
    paymentStatusLabel: invoiceStatusLabel({
      totalPaise,
      paidPaise,
      dueLabel: PAYMENT_STATUS_META[dueStatus].label,
    }),
    tenantName: tenancy.tenant.fullName,
    tenantPhone: tenancy.tenant.phone,
    dateOfJoining: isoDate(tenancy.checkInDate),
    roomNumber: tenancy.bed.room.number,
    bedLabel: tenancy.bed.label,
    rentPaise,
    maintenancePaise,
    previousDuePaise: charges.previousDuePaise,
    extraChargesPaise: charges.extraChargesPaise,
    extraChargesLabel: charges.extraChargesLabel,
    discountPaise: charges.discountPaise,
    subtotalPaise,
    totalPaise,
    paidPaise,
    balancePaise: invoiceBalancePaise(totalPaise, paidPaise),
    payment: payment
      ? (() => {
          const { cash, online } = paymentSplit(payment);
          return {
            amountPaise: payment.amount,
            methodLabel: PAYMENT_METHOD_META[payment.method].label,
            cashPaise: cash,
            onlinePaise: online,
            collectedAt: isoDate(payment.paidAt ?? payment.createdAt),
          };
        })()
      : null,
    notes: charges.notes,
  });

  return { tenancy, payment, rentPaise, maintenancePaise, subtotalPaise, totalPaise, paidPaise, view };
}

/** The invoice as it would be issued right now, WITHOUT persisting anything. */
export async function previewInvoice(
  property: InvoiceProperty,
  tenancyId: string,
  charges: InvoiceCharges,
): Promise<InvoiceView | null> {
  const composed = await composeInvoice(property, tenancyId, charges, null);
  if (!composed) return null;
  const seq = (await prisma.invoice.count({ where: { propertyId: property.id } })) + 1;
  return composed.view(formatInvoiceNumber(charges.billingMonth, seq), new Date());
}

/** Reserve a per-property invoice number by creating the row; retry on the rare race. */
async function createInvoiceRow(
  data: Omit<Prisma.InvoiceUncheckedCreateInput, "number" | "storageKey" | "status">,
  billingMonth: Date,
  propertyId: string,
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const count = await prisma.invoice.count({ where: { propertyId } });
    try {
      // Created as FAILED (= not yet delivered) and flipped to SENT once Twilio
      // accepts it. storageKey is filled in immediately after the PDF is stored.
      return await prisma.invoice.create({
        data: {
          ...data,
          number: formatInvoiceNumber(billingMonth, count + 1 + attempt),
          storageKey: "",
          status: "FAILED",
        },
        select: { id: true, number: true, issueDate: true },
      });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002" && attempt < 4) continue;
      throw e;
    }
  }
  throw new Error("Could not allocate an invoice number");
}

/**
 * Issue an invoice: persist it, store its PDF and try to deliver it on WhatsApp.
 * `ok: true` means the invoice exists; check `delivered` for whether it was sent.
 */
export async function issueInvoice(args: {
  property: InvoiceProperty;
  tenancyId: string;
  charges: InvoiceCharges;
  /** The collection this invoice is issued for (automatic invoices). */
  paymentId?: string | null;
}): Promise<IssueInvoiceResult> {
  const { property, tenancyId, charges } = args;
  const composed = await composeInvoice(property, tenancyId, charges, args.paymentId ?? null);
  if (!composed) return { ok: false, error: "Tenancy not found for this property" };
  const { tenancy, payment } = composed;

  // 1. Reserve the invoice number / row.
  let invoice;
  try {
    invoice = await createInvoiceRow(
      {
        propertyId: property.id,
        tenancyId: tenancy.id,
        tenantId: tenancy.tenantId,
        billingMonth: charges.billingMonth,
        dueDate: charges.dueDate,
        rentPaise: composed.rentPaise,
        maintenancePaise: composed.maintenancePaise,
        previousDuePaise: charges.previousDuePaise,
        extraChargesPaise: charges.extraChargesPaise,
        extraChargesLabel: charges.extraChargesLabel,
        discountPaise: charges.discountPaise,
        subtotalPaise: composed.subtotalPaise,
        totalPaise: composed.totalPaise,
        paidPaise: composed.paidPaise,
        receivedPaise: payment?.amount ?? null,
        paymentId: payment?.id ?? null,
        notes: charges.notes,
      },
      charges.billingMonth,
      property.id,
    );
  } catch {
    return { ok: false, error: "Could not allocate an invoice number. Please try again." };
  }

  // 2. Render + store the PDF; if this fails, drop the reserved row (no orphan).
  try {
    const pdfBytes = await generateInvoicePdf(composed.view(invoice.number, invoice.issueDate));
    const bytes = new Uint8Array(pdfBytes.byteLength);
    bytes.set(pdfBytes);
    const file = new File([bytes], `${invoice.number}.pdf`, { type: "application/pdf" });
    const saved = await storage.save(file, "invoices");
    await prisma.invoice.update({ where: { id: invoice.id }, data: { storageKey: saved.key } });
  } catch (e) {
    await prisma.invoice.delete({ where: { id: invoice.id } }).catch(() => {});
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not generate the invoice PDF",
    };
  }

  // 3. Deliver. A failure is recorded on the row, not returned as an error.
  const delivery = await deliverInvoice(property, invoice.id);
  return {
    ok: true,
    invoiceId: invoice.id,
    number: invoice.number,
    delivered: delivery.delivered,
    messageSid: delivery.messageSid,
    deliveryError: delivery.error,
  };
}

/**
 * Send an already-stored invoice PDF on WhatsApp and record the outcome on the row
 * (SENT + message SID, or FAILED + `lastError`). Never throws.
 */
export async function deliverInvoice(
  property: InvoiceProperty,
  invoiceId: string,
): Promise<{ delivered: boolean; messageSid: string | null; error: string | null }> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, propertyId: property.id },
    select: {
      id: true,
      storageKey: true,
      billingMonth: true,
      dueDate: true,
      totalPaise: true,
      paidPaise: true,
      receivedPaise: true,
      tenant: { select: { fullName: true, phone: true } },
      tenancy: { select: { bed: { select: { label: true, room: { select: { number: true } } } } } },
      payment: { select: { method: true, paidAt: true } },
    },
  });

  const fail = async (error: string) => {
    if (invoice) {
      await prisma.invoice
        .update({ where: { id: invoice.id }, data: { status: "FAILED", lastError: error } })
        .catch(() => {});
    }
    return { delivered: false, messageSid: null, error };
  };

  if (!invoice) return fail("Invoice not found");
  if (!invoice.storageKey) return fail("This invoice has no stored PDF to send");
  if (!invoice.tenant.phone) return fail("Tenant has no phone number on file");
  const baseUrl = resolvePublicBaseUrl();
  if (!baseUrl.ok) return fail(baseUrl.error);

  try {
    const messageSid = await sendWhatsAppMedia({
      to: invoice.tenant.phone,
      body: buildInvoiceMessage({
        tenantName: invoice.tenant.fullName,
        room: unitLabel(property.isFlat, invoice.tenancy.bed.room.number, invoice.tenancy.bed.label),
        billingMonth: invoice.billingMonth,
        dueDate: invoice.dueDate,
        totalPaise: invoice.totalPaise,
        paidPaise: invoice.paidPaise,
        receivedPaise: invoice.receivedPaise,
        method: invoice.payment?.method ?? null,
        paidAt: invoice.payment?.paidAt ?? null,
        propertyName: property.name,
      }),
      mediaUrl: buildMediaUrl(baseUrl.base, invoice.storageKey),
    });
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "SENT", messageSid, sentAt: new Date(), lastError: null },
    });
    return { delivered: true, messageSid, error: null };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Failed to send the WhatsApp message");
  }
}

/**
 * Issue the invoice for one recorded collection: the collection's billing month, what
 * has been paid towards it so far, and the balance left. Any unpaid balance from
 * earlier months is mentioned in the notes rather than added to the total, so the
 * invoice's balance always matches the Collect Rent dialog for that month.
 */
export async function issueInvoiceForPayment(
  property: InvoiceProperty,
  paymentId: string,
): Promise<IssueInvoiceResult> {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, propertyId: property.id, status: "PAID" },
    select: {
      id: true,
      forMonth: true,
      tenancy: {
        select: {
          id: true,
          monthlyRent: true,
          maintenanceCharge: true,
          paymentDueDay: true,
          checkInDate: true,
          createdAt: true,
        },
      },
    },
  });
  if (!payment) return { ok: false, error: "Collection not found" };
  const { tenancy, forMonth } = payment;

  const start = ledgerStartMonth(tenancy);
  const collected = await loadCollectedByMonth(prisma, [tenancy.id], start, subMonths(forMonth, 1));
  const earlier = earlierDues({
    duePaise: monthlyDuePaise(tenancy),
    startMonth: start,
    beforeMonth: forMonth,
    collectedByMonth: collected.get(tenancy.id) ?? new Map(),
  });
  const notes =
    earlier.paise > 0
      ? `Outstanding from earlier months (${describeMonths(earlier.months)}): ${rsText(
          earlier.paise,
        )}. Not included in the total above.`
      : null;

  return issueInvoice({
    property,
    tenancyId: tenancy.id,
    paymentId: payment.id,
    charges: {
      billingMonth: forMonth,
      dueDate: defaultDueDate(tenancy.paymentDueDay, forMonth),
      previousDuePaise: 0,
      extraChargesPaise: 0,
      extraChargesLabel: null,
      discountPaise: 0,
      notes,
    },
  });
}

/** "Jul 2026, Aug 2026" — capped so a long arrears run stays readable. */
export function describeMonths(keys: string[]): string {
  const labels = keys.map((k) => format(new Date(`${k}-01T00:00:00`), "MMM yyyy"));
  if (labels.length <= 3) return labels.join(", ");
  return `${labels.slice(0, 3).join(", ")} +${labels.length - 3} more`;
}

function buildInvoiceMessage(args: {
  tenantName: string;
  room: string;
  billingMonth: Date;
  dueDate: Date | null;
  totalPaise: number;
  paidPaise: number;
  receivedPaise: number | null;
  method: PaymentMethod | null;
  paidAt: Date | null;
  propertyName: string;
}): string {
  const month = format(args.billingMonth, "MMMM yyyy");
  const balance = invoiceBalancePaise(args.totalPaise, args.paidPaise);
  const due = args.dueDate ? format(args.dueDate, "dd MMM yyyy") : null;
  const lines = [`Hello ${args.tenantName},`, ""];

  if (args.receivedPaise !== null) {
    const how = args.method ? ` by ${PAYMENT_METHOD_META[args.method].label}` : "";
    const when = args.paidAt ? ` on ${format(args.paidAt, "dd MMM yyyy")}` : "";
    lines.push(
      `We have received ${formatINR(args.receivedPaise)}${how}${when} towards your rent for ${month}. Your invoice is attached.`,
      "",
      `Room: ${args.room}`,
      `Total for ${month}: ${formatINR(args.totalPaise)}`,
      `Paid so far: ${formatINR(args.paidPaise)}`,
    );
    if (balance > 0) {
      lines.push(`Balance due: ${formatINR(balance)}${due ? ` (due ${due})` : ""}`);
    } else {
      lines.push("", `Your rent for ${month} is fully paid.`);
    }
  } else {
    lines.push(
      `Your rent invoice for ${month} is attached.`,
      "",
      `Room: ${args.room}`,
      `Total: ${formatINR(args.totalPaise)}`,
    );
    if (args.paidPaise > 0) lines.push(`Paid so far: ${formatINR(args.paidPaise)}`);
    lines.push(`Amount due: ${formatINR(balance)}`, `Due date: ${due ?? "—"}`);
    if (balance > 0) lines.push("", "Please complete the payment before the due date.");
  }

  lines.push("", "Thank you,", args.propertyName);
  return lines.join("\n");
}
