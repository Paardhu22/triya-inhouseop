"use server";

import { revalidatePath } from "next/cache";
import { startOfMonth } from "date-fns";

import { auth } from "@/auth";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/prisma";
import { getSelectedPropertyId } from "@/lib/property";
import { rupeesToPaise } from "@/lib/money";
import { storage } from "@/lib/storage";
import { saveBedSchema } from "@/lib/validations/tenant";

async function requireContext() {
  const session = await auth();
  if (!session?.user) return null;
  const propertyId = await getSelectedPropertyId();
  if (!propertyId) return null;
  return { propertyId };
}

function revalidateFloorViews() {
  revalidatePath("/floor-manager");
  revalidatePath("/dashboard");
  revalidatePath("/tenants");
}

/** Trim a FormData text field to a string, or undefined when blank. */
function field(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

/**
 * Save a bed from the bed-details form. A single action covers every case:
 * marking a bed Available (vacating any occupant) or Occupied (assigning a new
 * tenant or editing the current one), plus the optional KYC photo.
 */
export async function saveBed(formData: FormData): Promise<ActionResult> {
  const ctx = await requireContext();
  if (!ctx) return actionError("Not authenticated");

  const parsed = saveBedSchema.safeParse({
    bedId: field(formData, "bedId"),
    occupancyStatus: field(formData, "occupancyStatus"),
    fullName: field(formData, "fullName"),
    phone: field(formData, "phone"),
    rentAmount: field(formData, "rentAmount"),
    checkInDate: field(formData, "checkInDate"),
    paymentStatus: field(formData, "paymentStatus"),
  });
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid details");
  }
  const data = parsed.data;

  const bed = await prisma.bed.findFirst({
    where: { id: data.bedId, propertyId: ctx.propertyId },
    select: {
      id: true,
      roomId: true,
      tenancies: {
        where: { status: "ACTIVE" },
        take: 1,
        select: { id: true, tenantId: true },
      },
    },
  });
  if (!bed) return actionError("Bed not found");
  const active = bed.tenancies[0] ?? null;

  // --- Mark bed Available: end the current tenancy (kept as history). ---
  if (data.occupancyStatus === "AVAILABLE") {
    await prisma.$transaction(async (tx) => {
      if (active) {
        await tx.tenancy.update({
          where: { id: active.id },
          data: { status: "ENDED", checkOutDate: new Date() },
        });
      }
      await tx.bed.update({ where: { id: bed.id }, data: { status: "AVAILABLE" } });
    });
    revalidateFloorViews();
    return actionOk();
  }

  // --- Mark bed Occupied: tenant details are required. ---
  if (!data.fullName || !data.phone || data.rentAmount === undefined || !data.checkInDate) {
    return actionError("Tenant name, phone, rent and check-in date are required");
  }
  const fullName = data.fullName;
  const phone = data.phone;
  const checkInDate = data.checkInDate;
  const rentPaise = rupeesToPaise(data.rentAmount);
  const paymentStatus = data.paymentStatus ?? "PENDING";

  const photo = formData.get("photo");
  let saved: Awaited<ReturnType<typeof storage.save>> | null = null;
  if (photo instanceof File && photo.size > 0) {
    try {
      saved = await storage.save(photo, "kyc");
    } catch (e) {
      return actionError(e instanceof Error ? e.message : "Photo upload failed");
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      let tenantId: string;
      let tenancyId: string;

      if (active) {
        tenantId = active.tenantId;
        tenancyId = active.id;
        await tx.tenant.update({
          where: { id: tenantId },
          data: { fullName, phone, ...(saved ? { photoUrl: saved.key } : {}) },
        });
        await tx.tenancy.update({
          where: { id: tenancyId },
          data: { monthlyRent: rentPaise, paymentStatus, checkInDate },
        });
      } else {
        const tenant = await tx.tenant.create({
          data: {
            propertyId: ctx.propertyId,
            fullName,
            phone,
            photoUrl: saved?.key ?? null,
          },
        });
        tenantId = tenant.id;
        const tenancy = await tx.tenancy.create({
          data: {
            propertyId: ctx.propertyId,
            tenantId,
            bedId: bed.id,
            roomId: bed.roomId,
            status: "ACTIVE",
            monthlyRent: rentPaise,
            paymentStatus,
            checkInDate,
          },
        });
        tenancyId = tenancy.id;
        await tx.bed.update({ where: { id: bed.id }, data: { status: "OCCUPIED" } });
      }

      if (saved) {
        await tx.document.create({
          data: {
            tenantId,
            type: "PHOTO",
            storageKey: saved.key,
            filename: saved.filename,
            mimeType: saved.mimeType,
            size: saved.size,
          },
        });
      }

      // Keep the payments ledger in step with the paid/not-paid choice.
      if (paymentStatus === "PAID") {
        const monthStart = startOfMonth(new Date());
        const existing = await tx.payment.findFirst({
          where: { tenancyId, forMonth: monthStart },
          select: { id: true },
        });
        if (existing) {
          await tx.payment.update({
            where: { id: existing.id },
            data: { status: "PAID", amount: rentPaise, paidAt: new Date() },
          });
        } else {
          await tx.payment.create({
            data: {
              propertyId: ctx.propertyId,
              tenancyId,
              tenantId,
              amount: rentPaise,
              forMonth: monthStart,
              status: "PAID",
              paidAt: new Date(),
            },
          });
        }
      }
    });
  } catch {
    if (saved) await storage.remove(saved.key);
    return actionError("Could not save. Please try again.");
  }

  revalidateFloorViews();
  return actionOk();
}
