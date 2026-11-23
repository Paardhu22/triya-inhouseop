"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { getActionContext } from "@/lib/action-context";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { canReviewRegistrations } from "@/lib/registrations/permissions";
import { WEBSITE_SLUG_PATTERN } from "@/lib/registrations/shared";

/** Reject a pending request in the active property; deletes its KYC file. Idempotent. */
export async function rejectRegistration(id: string, reason?: string): Promise<ActionResult> {
  const context = await getActionContext();
  if (!context.ok) return actionError(context.error);
  const ctx = context.data;
  if (!canReviewRegistrations((await auth())?.user?.role)) return actionError("Only admins and managers can reject requests");
  if (typeof id !== "string" || id.length > 100) return actionError("Request not found");

  const request = await prisma.registrationRequest.findFirst({
    where: { id, propertyId: ctx.propertyId },
    select: { status: true, kycKey: true },
  });
  if (!request) return actionError("Request not found");
  if (request.status === "REJECTED") return actionOk();
  if (request.status !== "PENDING") return actionError("This request was already processed");

  const cleanReason = reason?.trim().slice(0, 300) || null;
  const res = await prisma.registrationRequest.updateMany({
    where: { id, propertyId: ctx.propertyId, status: "PENDING" },
    data: {
      status: "REJECTED", rejectionReason: cleanReason, reviewedById: ctx.userId, reviewedAt: new Date(),
      kycKey: null, kycFilename: null, kycMimeType: null, kycSize: null,
    },
  });
  if (res.count !== 1) return actionError("This request was just processed by someone else. Refresh.");
  if (request.kycKey) await storage.remove(request.kycKey).catch(() => undefined);
  revalidatePath("/registrations");
  return actionOk();
}

/** ADMIN only: link (or unlink with "") the active property to a website listing slug. */
export async function setWebsiteSlug(slugInput: string): Promise<ActionResult> {
  const context = await getActionContext();
  if (!context.ok) return actionError(context.error);
  if ((await auth())?.user?.role !== "ADMIN") return actionError("Only admins can change the website link");
  const slug = (slugInput ?? "").trim().toLowerCase();
  if (slug && (slug.length > 80 || !WEBSITE_SLUG_PATTERN.test(slug))) {
    return actionError("Use lowercase letters, numbers and hyphens, e.g. triya-house");
  }
  try {
    await prisma.property.update({ where: { id: context.data.propertyId }, data: { websiteSlug: slug || null } });
  } catch {
    return actionError("That website listing is already linked to another property");
  }
  revalidatePath("/registrations");
  return actionOk();
}
