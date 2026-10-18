import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validations/auth";
import { createMobileSession, mobileUserSelect } from "@/lib/mobile/session";

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter a valid email and password" }, { status: 400 });
  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
    include: { property: { select: { isActive: true } } },
  });
  if (!user || !user.isActive || (user.role !== "ADMIN" && !user.property?.isActive) ||
      !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return Response.json({ error: "Invalid email or password" }, { status: 401 });
  }
  const session = await createMobileSession(user.id);
  const safeUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: mobileUserSelect });
  return Response.json({ ...session, user: safeUser }, { headers: { "Cache-Control": "no-store" } });
}

/** Mirrors the existing web login account picker; no passwords or private profile fields. */
export async function GET() {
  const users = await prisma.user.findMany({
    where: { isActive: true, OR: [{ role: "ADMIN" }, { property: { isActive: true } }] },
    select: { name: true, email: true, role: true }, orderBy: [{ role: "asc" }, { name: "asc" }],
  });
  return Response.json({ users }, { headers: { "Cache-Control": "no-store" } });
}
