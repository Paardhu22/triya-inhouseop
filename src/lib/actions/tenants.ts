"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/prisma";
import { getSelectedPropertyId } from "@/lib/property";
import { storage } from "@/lib/storage";

async function requireContext() {
  const session = await auth();
  if (!session?.user) return null;
  const propertyId = await getSelectedPropertyId();
  if (!propertyId) return null;
  return { propertyId };
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
