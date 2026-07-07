"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

/**
 * Tenant self-serve Aadhaar/KYC document upload — interim until a real KYC
 * verification API is wired up. Reuses `Tenant.photoUrl`, the same "KYC Document"
 * slot the manager-side Floor Manager upload writes to (see floor.ts).
 */
export async function uploadOwnKycDocument(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user || session.user.role !== "TENANT") return actionError("Not authenticated");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return actionError("Choose your Aadhaar file to upload");

  const tenant = await prisma.tenant.findUnique({
    where: { userId: session.user.id },
    select: { id: true, photoUrl: true },
  });
  if (!tenant) return actionError("Tenant record not found");

  let saved;
  try {
    saved = await storage.save(file, "kyc");
  } catch (e) {
    return actionError(e instanceof Error ? e.message : "Upload failed");
  }

  await prisma.tenant.update({ where: { id: tenant.id }, data: { photoUrl: saved.key } });

  if (tenant.photoUrl) {
    try {
      await storage.remove(tenant.photoUrl);
    } catch (e) {
      console.error(`Failed to delete old KYC document ${tenant.photoUrl}:`, e);
    }
  }

  revalidatePath("/portal");
  return actionOk();
}
