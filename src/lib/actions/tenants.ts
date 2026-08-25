"use server";

import { revalidatePath } from "next/cache";
import { startOfMonth } from "date-fns";

import { type PaymentMethod } from "@/generated/prisma/client";
import { auth } from "@/auth";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { refreshPaymentStatus, settleMonth, voidMonthCollections } from "@/lib/ledger";
import { rupeesToPaise } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { getActiveProperty, getSelectedPropertyId } from "@/lib/property";
import { storage } from "@/lib/storage";
import { sendWhatsAppText } from "@/lib/twilio";

async function requireContext() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const propertyId = await getSelectedPropertyId();
  if (!propertyId) return null;
  return { propertyId, userId: session.user.id };
}

export async function deleteTenant(id: string): Promise<ActionResult> {
  const ctx = await requireContext();
  if (!ctx) return actionError("Not authenticated");

  // Fetch the tenant, their active tenancies, and documents to clean up files
  const tenant = await prisma.tenant.findFirst({
    where: { id, propertyId: ctx.propertyId },
    include: {
      tenancies: {
        where: { status: "ACTIVE" },
      },
      documents: true,
    },
  });

  if (!tenant) return actionError("Tenant not found");

  // Run transaction to ensure both bed statuses are set to AVAILABLE
  // and the tenant is deleted (with cascading deletion of tenancies, documents, payments, complaints)
  await prisma.$transaction(async (tx) => {
    const activeBedIds = tenant.tenancies.map((t) => t.bedId);

    if (activeBedIds.length > 0) {
      await tx.bed.updateMany({
        where: { id: { in: activeBedIds } },
        data: { status: "AVAILABLE" },
      });
    }

    await tx.tenant.delete({
      where: { id: tenant.id },
    });
  });

  // Clean up any files from local disk storage
  if (tenant.photoUrl) {
    try {
      await storage.remove(tenant.photoUrl);
    } catch (e) {
      console.error(`Failed to delete tenant photo ${tenant.photoUrl}:`, e);
    }
  }

  for (const doc of tenant.documents) {
    try {
      await storage.remove(doc.storageKey);
    } catch (e) {
      console.error(`Failed to delete document ${doc.storageKey}:`, e);
    }
  }

  // Revalidate relevant pages
  revalidatePath("/tenants");
  revalidatePath("/floor-manager");
  revalidatePath("/dashboard");
  revalidatePath("/complaints");
  revalidatePath("/expenses");

  return actionOk();
}

export async function togglePaymentStatus(
  tenancyId: string,
  newStatus: "PAID" | "PENDING" | "OVERDUE",
  paymentMethod?: PaymentMethod,
  /** Rupees, as entered in the dialog. Only used for a SPLIT collection. */
  cashAmount?: number,
  onlineAmount?: number,
): Promise<ActionResult> {
  const ctx = await requireContext();
  if (!ctx) return actionError("Not authenticated");

  const tenancy = await prisma.tenancy.findFirst({
    where: { id: tenancyId, propertyId: ctx.propertyId, status: "ACTIVE" },
    select: {
      id: true,
      tenantId: true,
      monthlyRent: true,
      maintenanceCharge: true,
      paymentDueDay: true,
    },
  });

  if (!tenancy) return actionError("Active tenancy not found");

  const monthStart = startOfMonth(new Date());

  await prisma.$transaction(async (tx) => {
    if (newStatus === "PAID") {
      await settleMonth(tx, {
        propertyId: ctx.propertyId,
        tenancy,
        forMonth: monthStart,
        method: paymentMethod ?? "CASH",
        // The dialog collects rupees; the ledger stores paise.
        cashPaise: rupeesToPaise(cashAmount ?? 0),
        onlinePaise: rupeesToPaise(onlineAmount ?? 0),
        recordedById: ctx.userId,
        at: new Date(),
      });
    } else {
      // Reversing the month: the receipts are kept but moved out of PAID so they stop
      // counting towards the collected total.
      await voidMonthCollections(tx, tenancy.id, monthStart, newStatus);
    }
    // The snapshot is always derived from the ledger, never written directly, so this
    // screen, Collect Rent and the reports cannot drift apart.
    await refreshPaymentStatus(tx, tenancy);
  });

  revalidatePath("/tenants");
  revalidatePath("/collections");
  revalidatePath("/reports");
  revalidatePath("/dashboard");
  revalidatePath("/floor-manager");
  revalidatePath(`/tenants/${tenancy.tenantId}`);

  return actionOk();
}

/**
 * Send the property's house rules (configured in Settings) to one tenant over WhatsApp.
 * Plain text, no PDF — same shape as sendRentReminder in collections.ts. Nothing is
 * written to the database.
 */
export async function sendPgRules(
  tenantId: string,
): Promise<ActionResult<{ messageSid: string }>> {
  const session = await auth();
  if (!session?.user) return actionError("Not authenticated");

  const property = await getActiveProperty();
  if (!property) return actionError("No active property selected");
  if (!property.rulesText?.trim()) {
    return actionError("No PG rules configured yet. Add them in Settings first.");
  }

  const tenant = await prisma.tenant.findFirst({
    where: { id: tenantId, propertyId: property.id },
    select: { fullName: true, phone: true },
  });
  if (!tenant) return actionError("Tenant not found");
  if (!tenant.phone) return actionError("Tenant has no phone number on file");

  const body = [
    `Hi ${tenant.fullName},`,
    "",
    `Here are the house rules for ${property.name}:`,
    "",
    property.rulesText.trim(),
    "",
    "Thank you,",
    property.name,
  ].join("\n");

  try {
    const messageSid = await sendWhatsAppText({ to: tenant.phone, body });
    return actionOk({ messageSid });
  } catch (e) {
    return actionError(e instanceof Error ? e.message : "Failed to send the PG rules");
  }
}
