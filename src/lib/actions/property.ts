"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { accessiblePropertyWhere, PROPERTY_COOKIE } from "@/lib/property";

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Set the globally-selected property. Validates the property exists, is active, and
 * that the signed-in user is actually allowed to access it (a property manager can
 * only ever select their own property).
 */
export async function selectProperty(
  propertyId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user) {
    return { ok: false, error: "Not authenticated" };
  }

  const scope = await accessiblePropertyWhere();
  if (!scope) {
    return { ok: false, error: "Not authenticated" };
  }

  const property = await prisma.property.findFirst({
    where: { id: propertyId, isActive: true, ...scope },
    select: { id: true },
  });
  if (!property) {
    return { ok: false, error: "Property not found" };
  }

  const store = await cookies();
  store.set(PROPERTY_COOKIE, propertyId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR,
  });

  revalidatePath("/", "layout");
  return { ok: true };
}
