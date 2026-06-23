"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/prisma";
import { getSelectedPropertyId } from "@/lib/property";
import { complaintCreateSchema } from "@/lib/validations/complaint";
import type {
  ComplaintPriority,
  ComplaintStatus,
} from "@/generated/prisma/client";

async function requireContext() {
  const session = await auth();
  if (!session?.user) return null;
  const propertyId = await getSelectedPropertyId();
  if (!propertyId) return null;
  return { propertyId };
}

export async function createComplaint(input: unknown): Promise<ActionResult> {
  const ctx = await requireContext();
  if (!ctx) return actionError("Not authenticated");

  const parsed = complaintCreateSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid details");
  }
  const { title, description, priority, assignedToId } = parsed.data;

  await prisma.complaint.create({
    data: {
      propertyId: ctx.propertyId,
      title,
      description: description || null,
      priority,
      assignedToId: assignedToId || null,
    },
  });

  revalidatePath("/complaints");
  revalidatePath("/dashboard");
  return actionOk();
}

export async function updateComplaint(
  id: string,
  patch: {
    status?: ComplaintStatus;
    priority?: ComplaintPriority;
    assignedToId?: string | null;
  },
): Promise<ActionResult> {
  const ctx = await requireContext();
  if (!ctx) return actionError("Not authenticated");

  const complaint = await prisma.complaint.findFirst({
    where: { id, propertyId: ctx.propertyId },
    select: { id: true },
  });
  if (!complaint) return actionError("Complaint not found");

  await prisma.complaint.update({
    where: { id },
    data: {
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.priority ? { priority: patch.priority } : {}),
      ...(patch.assignedToId !== undefined
        ? { assignedToId: patch.assignedToId }
        : {}),
      ...(patch.status
        ? { resolvedAt: patch.status === "RESOLVED" ? new Date() : null }
        : {}),
    },
  });

  revalidatePath("/complaints");
  revalidatePath("/dashboard");
  return actionOk();
}
