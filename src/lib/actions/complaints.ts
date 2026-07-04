"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/prisma";
import { getSelectedPropertyId } from "@/lib/property";
import {
  complaintCreateSchema,
  complaintUpdateSchema,
} from "@/lib/validations/complaint";

async function requireContext() {
  const session = await auth();
  if (!session?.user) return null;
  const propertyId = await getSelectedPropertyId();
  if (!propertyId) return null;
  return { propertyId };
}

async function assigneeExists(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  return Boolean(user);
}

export async function createComplaint(input: unknown): Promise<ActionResult> {
  const ctx = await requireContext();
  if (!ctx) return actionError("Not authenticated");

  const parsed = complaintCreateSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid details");
  }
  const { title, description, priority, assignedToId } = parsed.data;

  if (assignedToId && !(await assigneeExists(assignedToId))) {
    return actionError("Assigned user not found");
  }

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

export async function updateComplaint(id: string, patch: unknown): Promise<ActionResult> {
  const ctx = await requireContext();
  if (!ctx) return actionError("Not authenticated");

  const parsed = complaintUpdateSchema.safeParse(patch);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Invalid update");
  }
  const data = parsed.data;

  const complaint = await prisma.complaint.findFirst({
    where: { id, propertyId: ctx.propertyId },
    select: { id: true },
  });
  if (!complaint) return actionError("Complaint not found");

  if (data.assignedToId && !(await assigneeExists(data.assignedToId))) {
    return actionError("Assigned user not found");
  }

  await prisma.complaint.update({
    where: { id },
    data: {
      ...(data.status ? { status: data.status } : {}),
      ...(data.priority ? { priority: data.priority } : {}),
      ...(data.assignedToId !== undefined
        ? { assignedToId: data.assignedToId ? data.assignedToId : null }
        : {}),
      ...(data.status ? { resolvedAt: data.status === "RESOLVED" ? new Date() : null } : {}),
    },
  });

  revalidatePath("/complaints");
  revalidatePath("/dashboard");
  return actionOk();
}
