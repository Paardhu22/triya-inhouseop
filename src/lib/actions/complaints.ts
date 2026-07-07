"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { sendComplaintResolvedNotice } from "@/lib/aisensy";
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

const ownComplaintSchema = complaintCreateSchema.pick({ title: true, description: true, priority: true });

/** A tenant filing a complaint about their own stay. tenantId/propertyId come from
 * the caller's own Tenant record, never from client input. */
export async function createOwnComplaint(input: unknown): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user || session.user.role !== "TENANT") return actionError("Not authenticated");

  const tenant = await prisma.tenant.findUnique({
    where: { userId: session.user.id },
    select: { id: true, propertyId: true, tenancies: { where: { status: "ACTIVE" }, take: 1, select: { roomId: true } } },
  });
  if (!tenant) return actionError("Tenant record not found");

  const parsed = ownComplaintSchema.safeParse(input);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid details");
  const { title, description, priority } = parsed.data;

  await prisma.complaint.create({
    data: {
      propertyId: tenant.propertyId,
      tenantId: tenant.id,
      roomId: tenant.tenancies[0]?.roomId ?? null,
      title,
      description: description || null,
      priority,
    },
  });

  revalidatePath("/portal/complaints");
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
    select: { id: true, title: true, status: true, tenant: { select: { fullName: true, phone: true } } },
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

  // Best-effort WhatsApp notice — never blocks or fails the resolve action.
  if (data.status === "RESOLVED" && complaint.status !== "RESOLVED" && complaint.tenant) {
    void sendComplaintResolvedNotice({
      phone: complaint.tenant.phone,
      userName: complaint.tenant.fullName,
      complaintTitle: complaint.title,
    }).catch(() => {});
  }

  revalidatePath("/complaints");
  revalidatePath("/dashboard");
  return actionOk();
}
