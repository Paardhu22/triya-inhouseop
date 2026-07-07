"use server";

import { revalidatePath } from "next/cache";
import { startOfMonth } from "date-fns";
import bcrypt from "bcryptjs";

import { auth } from "@/auth";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { sendLoginCredentials } from "@/lib/whatsapp";
import { prisma } from "@/lib/prisma";
import { getSelectedPropertyId } from "@/lib/property";
import { rupeesToPaise } from "@/lib/money";
import { storage } from "@/lib/storage";
import { MAINTENANCE_RESERVE_PAISE, resolveDepositStatusOnVacate } from "@/lib/tenancy";
import { saveBedSchema } from "@/lib/validations/tenant";

async function requireContext() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const propertyId = await getSelectedPropertyId();
  if (!propertyId) return null;
  return { propertyId, userId: session.user.id };
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

/** A short, easy-to-read temporary password for a freshly-provisioned portal login. */
function generateTempPassword(): string {
  return `Dazz${Math.floor(1000 + Math.random() * 9000)}!`;
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
    email: field(formData, "email"),
    rentAmount: field(formData, "rentAmount"),
    maintenanceCharge: field(formData, "maintenanceCharge"),
    securityDeposit: field(formData, "securityDeposit"),
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
        select: { id: true, tenantId: true, noticeGivenDate: true },
      },
    },
  });
  if (!bed) return actionError("Bed not found");
  const active = bed.tenancies[0] ?? null;

  // --- Mark bed Available: end the current tenancy (kept as history). ---
  if (data.occupancyStatus === "AVAILABLE") {
    await prisma.$transaction(async (tx) => {
      if (active) {
        const checkOutDate = new Date();
        const depositStatus = resolveDepositStatusOnVacate(
          active.noticeGivenDate,
          checkOutDate,
        );
        await tx.tenancy.update({
          where: { id: active.id },
          data: { status: "ENDED", checkOutDate, depositStatus },
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
  const email = data.email ? data.email : null;
  const checkInDate = data.checkInDate;
  const rentPaise = rupeesToPaise(data.rentAmount);
  const maintenancePaise = rupeesToPaise(data.maintenanceCharge ?? 0);
  const grossDepositPaise =
    data.securityDeposit !== undefined ? rupeesToPaise(data.securityDeposit) : null;
  const paymentStatus = data.paymentStatus ?? "PENDING";
  const paymentMethod = data.paymentMethod ?? "CASH";
  const cashAmountPaise = data.cashAmount !== undefined ? rupeesToPaise(data.cashAmount) : null;
  const onlineAmountPaise = data.onlineAmount !== undefined ? rupeesToPaise(data.onlineAmount) : null;

  const photo = formData.get("photo");
  let saved: Awaited<ReturnType<typeof storage.save>> | null = null;
  if (photo instanceof File && photo.size > 0) {
    try {
      saved = await storage.save(photo, "kyc");
    } catch (e) {
      return actionError(e instanceof Error ? e.message : "Photo upload failed");
    }
  }

  let oldPhotoUrl: string | null = null;
  let oldDocKeys: string[] = [];
  let createdLogin: { email: string; password: string } | null = null;

  try {
    createdLogin = await prisma.$transaction(async (tx) => {
      let tenantId: string;
      let tenancyId: string;
      let newLogin: { email: string; password: string } | null = null;

      if (active) {
        tenantId = active.tenantId;
        tenancyId = active.id;

        const existingTenant = await tx.tenant.findUnique({
          where: { id: tenantId },
          select: { photoUrl: true },
        });
        if (existingTenant?.photoUrl && saved) {
          oldPhotoUrl = existingTenant.photoUrl;
        }

        await tx.tenant.update({
          where: { id: tenantId },
          data: { fullName, phone, email, ...(saved ? { photoUrl: saved.key } : {}) },
        });
        await tx.tenancy.update({
          where: { id: tenancyId },
          data: {
            monthlyRent: rentPaise,
            maintenanceCharge: maintenancePaise,
            // Editing an existing tenancy: the move-in reserve was already applied,
            // so store the entered deposit as-is.
            ...(grossDepositPaise !== null ? { securityDeposit: grossDepositPaise } : {}),
            paymentStatus,
            checkInDate,
          },
        });
      } else {
        const tenant = await tx.tenant.create({
          data: {
            propertyId: ctx.propertyId,
            fullName,
            phone,
            email,
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
            maintenanceCharge: maintenancePaise,
            // Move-in: hold back the fixed ₹1000 maintenance reserve from the deposit.
            securityDeposit:
              grossDepositPaise !== null
                ? Math.max(0, grossDepositPaise - MAINTENANCE_RESERVE_PAISE)
                : null,
            paymentStatus,
            checkInDate,
          },
        });
        tenancyId = tenancy.id;
        await tx.bed.update({ where: { id: bed.id }, data: { status: "OCCUPIED" } });

        // Auto-provision a portal login for the new resident so they can pay dues
        // and file complaints. Best-effort: silently skipped if the derived email
        // is already taken by another account (tenant record is still created).
        // Credentials are sent over WhatsApp after the transaction commits (see below).
        const loginEmail = email ?? `${phone.replace(/\D/g, "")}@tenant.dazz.local`;
        const emailTaken = await tx.user.findUnique({
          where: { email: loginEmail },
          select: { id: true },
        });
        if (!emailTaken) {
          const password = generateTempPassword();
          const passwordHash = await bcrypt.hash(password, 12);
          const tenantUser = await tx.user.create({
            data: {
              name: fullName,
              email: loginEmail,
              passwordHash,
              role: "TENANT",
              propertyId: ctx.propertyId,
            },
          });
          await tx.tenant.update({ where: { id: tenantId }, data: { userId: tenantUser.id } });
          newLogin = { email: loginEmail, password };
        }
      }

      if (saved) {
        // Fetch old documents of type PHOTO to delete later
        const existingDocs = await tx.document.findMany({
          where: { tenantId, type: "PHOTO" },
          select: { storageKey: true },
        });
        oldDocKeys = existingDocs.map((d) => d.storageKey);

        // Delete old document entries in db
        await tx.document.deleteMany({
          where: { tenantId, type: "PHOTO" },
        });

        // Create new document entry
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
            data: {
              status: "PAID",
              amount: rentPaise,
              method: paymentMethod,
              cashAmount: cashAmountPaise,
              onlineAmount: onlineAmountPaise,
              paidAt: new Date(),
              recordedById: ctx.userId,
            },
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
              method: paymentMethod,
              cashAmount: cashAmountPaise,
              onlineAmount: onlineAmountPaise,
              paidAt: new Date(),
              recordedById: ctx.userId,
            },
          });
        }
      }

      return newLogin;
    });
  } catch {
    if (saved) await storage.remove(saved.key);
    return actionError("Could not save. Please try again.");
  }

  // Best-effort WhatsApp credential delivery — never blocks or fails the save.
  if (createdLogin) {
    void sendLoginCredentials({
      phone,
      userName: fullName,
      email: createdLogin.email,
      password: createdLogin.password,
    }).then((res) => {
      if (!res.ok) console.error(`[whatsapp] credentials WhatsApp to ${phone} failed: ${res.error}`);
    });
  }

  // Clean up old files from storage after successful transaction
  if (oldPhotoUrl) {
    try {
      await storage.remove(oldPhotoUrl);
    } catch (e) {
      console.error("Failed to remove old photo Url:", e);
    }
  }
  for (const key of oldDocKeys) {
    try {
      if (key !== oldPhotoUrl) {
        await storage.remove(key);
      }
    } catch (e) {
      console.error("Failed to remove old document photo key:", e);
    }
  }

  revalidateFloorViews();
  return actionOk();
}

/**
 * Record that the tenant on an active tenancy has given notice. The vacate-by
 * date (notice date + 15 days) is derived, not stored. Idempotent: if notice was
 * already given the existing date is kept.
 */
export async function giveNotice(tenancyId: string): Promise<ActionResult> {
  const ctx = await requireContext();
  if (!ctx) return actionError("Not authenticated");

  const tenancy = await prisma.tenancy.findFirst({
    where: { id: tenancyId, propertyId: ctx.propertyId, status: "ACTIVE" },
    select: { id: true, noticeGivenDate: true },
  });
  if (!tenancy) return actionError("Active tenancy not found");
  if (tenancy.noticeGivenDate) return actionError("Notice has already been given");

  await prisma.tenancy.update({
    where: { id: tenancy.id },
    data: { noticeGivenDate: new Date() },
  });

  revalidateFloorViews();
  return actionOk();
}
