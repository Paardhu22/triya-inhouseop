"use server";

import { revalidatePath } from "next/cache";
import { startOfMonth } from "date-fns";

import { type PaymentMethod } from "@/generated/prisma/client";
import { auth } from "@/auth";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
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
  cashAmount?: number,
  onlineAmount?: number,
): Promise<ActionResult> {
  const ctx = await requireContext();
  if (!ctx) return actionError("Not authenticated");

  const tenancy = await prisma.tenancy.findFirst({
    where: { id: tenancyId, propertyId: ctx.propertyId, status: "ACTIVE" },
    select: { id: true, tenantId: true, monthlyRent: true },
  });

  if (!tenancy) return actionError("Active tenancy not found");

  await prisma.$transaction(async (tx) => {
    await tx.tenancy.update({
      where: { id: tenancy.id },
      data: { paymentStatus: newStatus },
    });

    const monthStart = startOfMonth(new Date());
    const existing = await tx.payment.findFirst({
      where: { tenancyId: tenancy.id, forMonth: monthStart },
      select: { id: true },
    });

    if (newStatus === "PAID") {
      if (existing) {
        await tx.payment.update({
          where: { id: existing.id },
          data: {
            status: "PAID",
            amount: tenancy.monthlyRent,
            method: paymentMethod ?? "CASH",
            cashAmount: cashAmount ?? null,
            onlineAmount: onlineAmount ?? null,
            paidAt: new Date(),
            recordedById: ctx.userId,
          },
        });
      } else {
        await tx.payment.create({
          data: {
            propertyId: ctx.propertyId,
            tenancyId: tenancy.id,
            tenantId: tenancy.tenantId,
            amount: tenancy.monthlyRent,
            forMonth: monthStart,
            status: "PAID",
            method: paymentMethod ?? "CASH",
            cashAmount: cashAmount ?? null,
            onlineAmount: onlineAmount ?? null,
            paidAt: new Date(),
            recordedById: ctx.userId,
          },
        });
      }
    } else {
      if (existing) {
        await tx.payment.update({
          where: { id: existing.id },
          data: { status: newStatus, paidAt: null },
        });
      }
    }
  });

  revalidatePath("/tenants");
  revalidatePath("/collections");
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
