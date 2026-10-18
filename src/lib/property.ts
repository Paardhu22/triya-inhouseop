import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";

import { auth } from "@/auth";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export const PROPERTY_COOKIE = "triya.property";

/** The currently selected property id from the cookie (no validation). */
export async function getSelectedPropertyId(): Promise<string | null> {
  const requestHeaders = await headers();
  if (requestHeaders.has("authorization")) {
    const { getMobileSession } = await import("@/lib/mobile/session");
    const session = await getMobileSession();
    const id = requestHeaders.get("x-triya-property");
    if (!session || !id || (session.user.role !== "ADMIN" && session.user.propertyId !== id)) return null;
    const property = await prisma.property.findFirst({ where: { id, isActive: true }, select: { id: true } });
    return property?.id ?? null;
  }
  const store = await cookies();
  return store.get(PROPERTY_COOKIE)?.value ?? null;
}

/**
 * A Prisma `where` fragment that limits Property rows to the ones the signed-in user
 * may access. ADMIN sees every property; a non-admin (property manager) account is
 * scoped to the single property it is linked to via `User.propertyId`. Returns `null`
 * when there is no session, so callers can short-circuit to "no access".
 */
export async function accessiblePropertyWhere(): Promise<Prisma.PropertyWhereInput | null> {
  const session = await auth();
  if (!session?.user) return null;
  if (session.user.role === "ADMIN") return {};
  return { users: { some: { id: session.user.id } } };
}

/** Request-scoped: layout and page share one authorized property lookup per render. */
export const getActiveProperty = cache(async () => {
  const id = await getSelectedPropertyId();
  if (!id) return null;
  const scope = await accessiblePropertyWhere();
  if (!scope) return null;
  return prisma.property.findFirst({ where: { id, isActive: true, ...scope } });
});

/** Like getActiveProperty but throws — for pages that are always inside a property. */
export async function requireActiveProperty() {
  const property = await getActiveProperty();
  if (!property) {
    throw new Error("No active property selected");
  }
  return property;
}

/** The properties the signed-in user may access, for the switcher and selection screen. */
export const listProperties = cache(async () => {
  const scope = await accessiblePropertyWhere();
  if (!scope) return [];
  return prisma.property.findMany({
    where: { isActive: true, ...scope },
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true, city: true, hasBlocks: true, logoKey: true },
  });
});
