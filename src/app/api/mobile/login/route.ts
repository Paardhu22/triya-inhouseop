import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validations/auth";
import { createMobileSession, mobileUserSelect } from "@/lib/mobile/session";
import { authenticateCredentials } from "@/lib/security/credentials";
import { clientAddress, enforceRateLimit } from "@/lib/security/rate-limit";
import { readJsonBody, requestErrorResponse } from "@/lib/security/request";
import { getLoginAccounts } from "@/lib/queries/login";

export async function POST(request: Request) {
  const rejected = await enforceRateLimit("login-ip", clientAddress(request.headers), 20);
  if (rejected) return rejected;
  let payload: unknown;
  try { payload = await readJsonBody(request, 4096); }
  catch (error) { return requestErrorResponse(error); }
  const parsed = loginSchema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: "Enter a valid email and password" }, { status: 400 });
  const user = await authenticateCredentials(parsed.data, request.headers);
  if (!user) {
    return Response.json({ error: "Invalid email or password" }, { status: 401 });
  }
  const session = await createMobileSession(user.id);
  const safeUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: mobileUserSelect });
  return Response.json({ ...session, user: safeUser }, { headers: { "Cache-Control": "no-store" } });
}

/** Mirrors the existing web login account picker; no passwords or private profile fields. */
export async function GET() {
  const users = await getLoginAccounts();
  return Response.json({ users }, { headers: { "Cache-Control": "no-store" } });
}
