"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";

import { auth } from "@/auth";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";
import { storage } from "@/lib/storage";
import {
  createPropertySchema,
  setAccountPasswordSchema,
  setPropertyActiveSchema,
} from "@/lib/validations/properties";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") return null;
  return session.user;
}

function bedLabels(count: number): string[] {
  return Array.from({ length: count }, (_, index) => String.fromCharCode(65 + index));
}

async function uniquePropertySlug(name: string): Promise<string> {
  const root = slugify(name) || "property";
  let slug = root;
  let suffix = 2;
  while (await prisma.property.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${root}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

/**
 * Create a property, its full floor/room/bed structure, and its scoped MANAGER account
 * in one transaction. Mirrors the seed's numbering so a wizard-created property is
 * indistinguishable from a seeded one.
 */
export async function createProperty(input: unknown): Promise<ActionResult<{ id: string }>> {
  if (!(await requireAdmin())) return actionError("Administrator access required");

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

        for (let sectionIndex = 0; sectionIndex < data.sections.length; sectionIndex += 1) {
          const section = data.sections[sectionIndex];
          const block = data.hasBlocks
            ? await tx.block.create({
                data: { propertyId: property.id, name: section.name.trim(), order: sectionIndex },
              })
            : null;

          const template = await tx.floorTemplate.create({
            data: {
              propertyId: property.id,
              name: block ? `Block ${block.name} Floor` : "Standard Floor",
              roomTemplates: {
                create: section.roomsPerFloor.map((sharingType, index) => ({
                  sequence: index + 1,
                  sharingType,
                })),
              },
            },
          });

          for (const floorNumber of section.floors) {
            await tx.floor.create({
              data: {
                propertyId: property.id,
                blockId: block?.id ?? null,
                templateId: template.id,
                number: floorNumber,
                name: `Floor ${floorNumber}`,
                order: floorNumber,
                rooms: {
                  create: section.roomsPerFloor.map((sharing, index) => {
                    const sequence = index + 1;
                    const number = `${block?.name ?? ""}${floorNumber}${String(sequence).padStart(2, "0")}`;
                    return {
                      propertyId: property.id,
                      number,
                      sharingType: sharing,
                      order: sequence,
                      beds: {
                        create: bedLabels(sharing).map((label, bedIndex) => ({
                          propertyId: property.id,
                          label,
                          order: bedIndex,
                        })),
                      },
                    };
                  }),
                },
              },
            });
          }
        }

        await tx.user.create({
          data: {
            name: data.name,
            email: data.account.email,
            passwordHash,
            role: "MANAGER",
            propertyId: property.id,
          },
        });

        return property;
      },
      { timeout: 30_000, maxWait: 10_000 },
    );

    revalidatePath("/admin");
    revalidatePath("/", "layout");
    return actionOk({ id: property.id });
  } catch {
    return actionError("Could not create the property. Check for duplicate floor or room numbers.");
  }
}

/** Admin sets a property account's password directly (no current-password needed). */
export async function setAccountPassword(input: unknown): Promise<ActionResult> {
  if (!(await requireAdmin())) return actionError("Administrator access required");

  const parsed = setAccountPasswordSchema.safeParse(input);
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Invalid password");

  const account = await prisma.user.findFirst({
    where: { id: parsed.data.userId, role: { not: "ADMIN" }, propertyId: { not: null } },
    select: { id: true },
  });
  if (!account) return actionError("Account not found");

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({ where: { id: account.id }, data: { passwordHash } });
  return actionOk();
}

/**
 * Deactivate (reversible "delete") or reactivate a property. Deactivating hides it from
 * every switcher/login and blocks its account from signing in, while keeping all data.
 */
export async function setPropertyActive(input: unknown): Promise<ActionResult> {
  if (!(await requireAdmin())) return actionError("Administrator access required");

  const parsed = setPropertyActiveSchema.safeParse(input);
  if (!parsed.success) return actionError("Invalid request");

  const updated = await prisma.property.updateMany({
    where: { id: parsed.data.propertyId },
    data: { isActive: parsed.data.active },
  });
  if (updated.count !== 1) return actionError("Property not found");

  revalidatePath("/admin");
  revalidatePath("/", "layout");
  return actionOk();
}

// PNG/JPEG only: both the on-screen preview and pdf-lib (which can only embed PNG/JPEG)
// must be able to render the logo. Other image types would break the invoice PDF.
const LOGO_TYPES = new Set(["image/png", "image/jpeg"]);

/** Upload/replace a property's logo (admin only). Stored via the file driver, old one removed. */
export async function setPropertyLogo(formData: FormData): Promise<ActionResult> {
  if (!(await requireAdmin())) return actionError("Administrator access required");

  const propertyId = String(formData.get("propertyId") ?? "");
  const file = formData.get("file");
  if (!propertyId) return actionError("Missing property");
  if (!(file instanceof File) || file.size === 0) return actionError("Choose an image file");
  if (!LOGO_TYPES.has(file.type)) return actionError("Logo must be a PNG or JPG image");

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true, logoKey: true },
  });
  if (!property) return actionError("Property not found");

  let key: string;
  try {
    const saved = await storage.save(file, "logos");
    key = saved.key;
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "Could not store the logo");
  }

  await prisma.property.update({ where: { id: property.id }, data: { logoKey: key } });

  if (property.logoKey && property.logoKey !== key) {
    try {
      await storage.remove(property.logoKey);
    } catch (error) {
      console.error(`Failed to delete old logo ${property.logoKey}:`, error);
    }
  }

  revalidatePath("/admin");
  revalidatePath("/", "layout");
  return actionOk();
}

/** Remove a property's logo (admin only), reverting invoices/chrome to the brand logo. */
export async function removePropertyLogo(input: { propertyId: string }): Promise<ActionResult> {
  if (!(await requireAdmin())) return actionError("Administrator access required");

  const property = await prisma.property.findUnique({
    where: { id: input.propertyId },
    select: { id: true, logoKey: true },
  });
  if (!property) return actionError("Property not found");
  if (!property.logoKey) return actionOk();

  await prisma.property.update({ where: { id: property.id }, data: { logoKey: null } });
  try {
    await storage.remove(property.logoKey);
  } catch (error) {
    console.error(`Failed to delete logo ${property.logoKey}:`, error);
  }

  revalidatePath("/admin");
  revalidatePath("/", "layout");
  return actionOk();
}
