"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";

import { auth } from "@/auth";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/prisma";
import { getSelectedPropertyId } from "@/lib/property";
import { passwordSchema, propertySettingsSchema } from "@/lib/validations/settings";

export async function changePassword(input: unknown): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return actionError("Not authenticated");
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid password");
  if (parsed.data.currentPassword === parsed.data.newPassword) {
    return actionError("Choose a new password that is different from the current password");
  }

  // Resolve a real user row. JWT sessions can outlive a db reseed, so fall back to the
  // session email (the self-healing lookup used in src/lib/actions/expenses.ts).
  const { id, email } = session.user;
  let user = id
    ? await prisma.user.findUnique({ where: { id }, select: { id: true, passwordHash: true } })
    : null;
  if (!user && email) {
    user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true },
    });
  }
  if (!user) {
    return actionError("Your session is out of date. Please sign out and sign in again.");
  }
  if (!(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
    return actionError("Current password is incorrect");
  }
  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  return actionOk();
}

export async function updatePropertySettings(input: unknown): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return actionError("Administrator access required");
  }
  const propertyId = await getSelectedPropertyId();
  if (!propertyId) return actionError("No property selected");
  const parsed = propertySettingsSchema.safeParse(input);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid property details");

  const updated = await prisma.property.updateMany({
    where: { id: propertyId, isActive: true },
    data: {
      name: parsed.data.name,
      address: parsed.data.address || null,
      city: parsed.data.city || null,
      phone: parsed.data.phone || null,
      rulesText: parsed.data.rulesText || null,
    },
  });
  if (updated.count !== 1) return actionError("Property not found");

  revalidatePath("/", "layout");
  revalidatePath("/settings");
  return actionOk();
}

