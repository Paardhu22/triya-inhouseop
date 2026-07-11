import "server-only";

import { cookies } from "next/headers";

import { auth } from "@/auth";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export const PROPERTY_COOKIE = "dazz.property";

/** The currently selected property id from the cookie (no validation). */
export async function getSelectedPropertyId(): Promise<string | null> {
  const store = await cookies();
  return store.get(PROPERTY_COOKIE)?.value ?? null;
}

/**
 * A Prisma `where` fragment that limits Property rows to the ones the signed-in user
 * may access. APP_OWNER sees every property; PROPERTY_OWNER is scoped to the
 * properties it owns via `PropertyOwnership`; MANAGER/TENANT are scoped to the single
 * property they are linked to via `User.propertyId`. Returns `null` when there is no
 * session, so callers can short-circuit to "no access".
 */
export async function accessiblePropertyWhere(): Promise<Prisma.PropertyWhereInput | null> {
  const session = await auth();
  // TEMP DEBUG — remove after Vercel "no properties" investigation
  console.log("[DEBUG] accessiblePropertyWhere current user id:", session?.user?.id);
  console.log("[DEBUG] accessiblePropertyWhere current role:", session?.user?.role);
  if (!session?.user) {
    console.log("[DEBUG] SESSION USER MISSING");
    return null;
  }
  let where: Prisma.PropertyWhereInput;
  if (session.user.role === "APP_OWNER") {
    where = {};
  } else if (session.user.role === "PROPERTY_OWNER") {
    where = { owners: { some: { userId: session.user.id } } };
  } else {
    where = { users: { some: { id: session.user.id } } };
  }
  console.log("[DEBUG] accessiblePropertyWhere returned where:", JSON.stringify(where));
  return where;
}

/** The selected property record, or null if none/invalid/not accessible to the user. */
export async function getActiveProperty() {
  const id = await getSelectedPropertyId();
  if (!id) return null;
  const scope = await accessiblePropertyWhere();
  if (!scope) return null;
  return prisma.property.findFirst({ where: { id, isActive: true, ...scope } });
}

/** Like getActiveProperty but throws — for pages that are always inside a property. */
export async function requireActiveProperty() {
  const property = await getActiveProperty();
  if (!property) {
    throw new Error("No active property selected");
  }
  return property;
}

/** The properties the signed-in user may access, for the switcher and selection screen. */
export async function listProperties() {
  const scope = await accessiblePropertyWhere();
  if (!scope) {
    // TEMP DEBUG — remove after Vercel "no properties" investigation
    console.log("[DEBUG] PROPERTY FILTER RETURNED EMPTY");
    return [];
  }
  const where = { isActive: true, ...scope };
  // TEMP DEBUG — remove after Vercel "no properties" investigation
  console.log("[DEBUG] listProperties where clause:", JSON.stringify(where));
  const properties = await prisma.property.findMany({
    where,
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true, city: true, hasBlocks: true, logoKey: true },
  });
  console.log("[DEBUG] listProperties number of properties returned:", properties.length);
  console.log("[DEBUG] listProperties property ids:", properties.map((p) => p.id));
  console.log("[DEBUG] listProperties property names:", properties.map((p) => p.name));
  if (properties.length === 0) {
    console.log("[DEBUG] ZERO ROWS RETURNED");
    console.log("[DEBUG] PROPERTY FILTER RETURNED EMPTY");
  }
  return properties;
}
