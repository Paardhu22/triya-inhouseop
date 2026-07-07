"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";

import { auth } from "@/auth";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { sendLoginCredentials } from "@/lib/aisensy";
import { prisma } from "@/lib/prisma";
import {
  assignPropertySchema,
  createPropertyOwnerSchema,
  setOwnerActiveSchema,
} from "@/lib/validations/property-owners";

async function requireAppOwner() {
  const session = await auth();
  if (!session?.user || session.user.role !== "APP_OWNER") return null;
  return session.user;
}

/**
 * Invite a new Property Owner: creates their account and pushes the login
 * credentials to them over WhatsApp (best-effort — never blocks account creation).
 * Properties are optional at creation time since owners create their own afterward.
 */
export async function createPropertyOwner(input: unknown): Promise<ActionResult<{ id: string }>> {
  if (!(await requireAppOwner())) return actionError("App Owner access required");

  const parsed = createPropertyOwnerSchema.safeParse(input);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid details");
  const data = parsed.data;

  const emailTaken = await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } });
  if (emailTaken) return actionError("An account with that email already exists");

  if (data.propertyIds.length > 0) {
    const properties = await prisma.property.findMany({
      where: { id: { in: data.propertyIds } },
      select: { id: true },
    });
    if (properties.length !== data.propertyIds.length) return actionError("One or more properties not found");
  }

  const passwordHash = await bcrypt.hash(data.password, 12);
  const owner = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone,
      passwordHash,
      role: "PROPERTY_OWNER",
      ownedProperties: {
        create: data.propertyIds.map((propertyId) => ({ propertyId })),
      },
    },
  });

  void sendLoginCredentials({
    phone: data.phone,
    userName: data.name,
    email: data.email,
    password: data.password,
  }).catch(() => {});

  revalidatePath("/admin");
  return actionOk({ id: owner.id });
}

/** Assign an additional property to an existing Property Owner. */
export async function assignPropertyToOwner(input: unknown): Promise<ActionResult> {
  if (!(await requireAppOwner())) return actionError("App Owner access required");

  const parsed = assignPropertySchema.safeParse(input);
  if (!parsed.success) return actionError("Invalid request");

  const owner = await prisma.user.findFirst({
    where: { id: parsed.data.userId, role: "PROPERTY_OWNER" },
    select: { id: true },
  });
  if (!owner) return actionError("Property owner not found");

  try {
    await prisma.propertyOwnership.create({
      data: { userId: parsed.data.userId, propertyId: parsed.data.propertyId },
    });
  } catch {
    return actionError("This owner already has that property");
  }

  revalidatePath("/admin");
  return actionOk();
}

/** Remove a property from a Property Owner's assigned list. */
export async function unassignPropertyFromOwner(input: unknown): Promise<ActionResult> {
  if (!(await requireAppOwner())) return actionError("App Owner access required");

  const parsed = assignPropertySchema.safeParse(input);
  if (!parsed.success) return actionError("Invalid request");

  await prisma.propertyOwnership.deleteMany({
    where: { userId: parsed.data.userId, propertyId: parsed.data.propertyId },
  });

  revalidatePath("/admin");
  return actionOk();
}

/** Activate/deactivate a Property Owner's login without removing their assignments. */
export async function setPropertyOwnerActive(input: unknown): Promise<ActionResult> {
  if (!(await requireAppOwner())) return actionError("App Owner access required");

  const parsed = setOwnerActiveSchema.safeParse(input);
  if (!parsed.success) return actionError("Invalid request");

  const updated = await prisma.user.updateMany({
    where: { id: parsed.data.userId, role: "PROPERTY_OWNER" },
    data: { isActive: parsed.data.active },
  });
  if (updated.count !== 1) return actionError("Property owner not found");

  revalidatePath("/admin");
  return actionOk();
}
