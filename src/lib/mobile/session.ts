import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

export const mobileUserSelect = { id: true, name: true, email: true, role: true, isActive: true, propertyId: true } as const;
const digest = (token: string) => createHash("sha256").update(token).digest("hex");

/** Opaque, revocable mobile sessions. Only a hash is stored in Postgres. */
export async function createMobileSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { userId, sessionToken: digest(token), expires } });
  return { token, expires: expires.toISOString() };
}

export async function getMobileSession() {
  const authorization = (await headers()).get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice(7);
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await prisma.session.findUnique({
    where: { sessionToken: digest(token) },
    include: { user: { select: { ...mobileUserSelect, property: { select: { isActive: true } } } } },
  });
  if (!session || session.expires <= new Date() || !session.user.isActive) return null;
  if (session.user.role !== "ADMIN" && !session.user.property?.isActive) return null;
  const { id, name, email, role, isActive, propertyId } = session.user;
  const user = { id, name, email, role, isActive, propertyId };
  return { user, expires: session.expires.toISOString() };
}

export async function deleteMobileSession() {
  const token = (await headers()).get("authorization")?.slice(7);
  if (token) await prisma.session.deleteMany({ where: { sessionToken: digest(token) } });
}

/** Every mobile read/write validates the current account AND property ownership. */
export async function mobileContext() {
  const session = await getMobileSession();
  if (!session) return null;
  const id = (await headers()).get("x-triya-property");
  if (!id || (session.user.role !== "ADMIN" && id !== session.user.propertyId)) return null;
  const property = await prisma.property.findFirst({ where: { id, isActive: true } });
  return property ? { ...session, property } : null;
}
