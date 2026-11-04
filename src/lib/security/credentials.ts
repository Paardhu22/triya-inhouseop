import "server-only";

import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validations/auth";
import { clientAddress, consumeRateLimit } from "./rate-limit";

export const credentialVersion = (passwordHash: string) => createHash("sha256").update(passwordHash).digest("hex");

export async function authenticateCredentials(input: unknown, headers: Headers) {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return null;
  const { email, password } = parsed.data;
  const throttle = await consumeRateLimit("login-account", `${clientAddress(headers)}:${email.toLowerCase()}`, 5, 5 * 60_000);
  if (!throttle.allowed) return null;
  const user = await prisma.user.findUnique({
    // Preserve existing account-picker identities, including legacy mixed-case
    // addresses. Rate-limit keys above still normalize case to prevent evasion.
    where: { email },
    include: { property: { select: { isActive: true } } },
  });
  if (!user || !user.isActive || (user.role !== "ADMIN" && !user.property?.isActive)) return null;
  if (!(await bcrypt.compare(password, user.passwordHash))) return null;
  return user;
}
