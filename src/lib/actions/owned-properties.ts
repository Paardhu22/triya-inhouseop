"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";

import { auth } from "@/auth";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { sendLoginCredentials } from "@/lib/whatsapp";
import { prisma } from "@/lib/prisma";
import { provisionPropertyStructure, uniquePropertySlug } from "@/lib/property-provisioning";
import { createPropertySchema } from "@/lib/validations/properties";

/**
 * A Property Owner's self-serve property creation — same structure wizard as the
 * (legacy) App Owner one, but auto-owned by the creating Property Owner via
 * `PropertyOwnership`, and scoped to PROPERTY_OWNER accounts only.
 */
export async function createOwnedProperty(input: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await auth();
  if (!session?.user || session.user.role !== "PROPERTY_OWNER") {
    return actionError("Property Owner access required");
  }

  const parsed = createPropertySchema.safeParse(input);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid property details");
  const data = parsed.data;

  const emailTaken = await prisma.user.findUnique({
    where: { email: data.account.email },
    select: { id: true },
  });
  if (emailTaken) return actionError("An account with that email already exists");

  const slug = await uniquePropertySlug(data.name);
  const passwordHash = await bcrypt.hash(data.account.password, 12);
  const ownerId = session.user.id;

  try {
    const property = await prisma.$transaction(
      async (tx) => {
        const property = await tx.property.create({
          data: {
            name: data.name,
            slug,
            city: data.city || null,
            address: data.address || null,
            phone: data.phone || null,
            isFlat: data.isFlat,
            hasBlocks: data.hasBlocks,
          },
        });

        await provisionPropertyStructure(tx, property.id, data);

        await tx.user.create({
          data: {
            name: data.name,
            email: data.account.email,
            phone: data.account.phone,
            passwordHash,
            role: "MANAGER",
            propertyId: property.id,
          },
        });

        await tx.propertyOwnership.create({
          data: { userId: ownerId, propertyId: property.id },
        });

        return property;
      },
      { timeout: 30_000, maxWait: 10_000 },
    );

    void sendLoginCredentials({
      phone: data.account.phone,
      userName: data.name,
      email: data.account.email,
      password: data.account.password,
    }).then((res) => {
      if (!res.ok) console.error(`[whatsapp] manager credentials WhatsApp to ${data.account.phone} failed: ${res.error}`);
    });

    revalidatePath("/owner-dashboard");
    revalidatePath("/", "layout");
    return actionOk({ id: property.id });
  } catch {
    return actionError("Could not create the property. Check for duplicate floor or room numbers.");
  }
}
