import { auth, handlers } from "@/auth";
import { NextRequest } from "next/server";
import { clientAddress, enforceRateLimit } from "@/lib/security/rate-limit";
import { readBoundedBody, requestErrorResponse } from "@/lib/security/request";

export async function GET(request: NextRequest) {
  // The session endpoint must use the same live-account/revocation checks as
  // business APIs, rather than reporting an old JWT as still authenticated.
  if (request.nextUrl.pathname.endsWith("/session")) {
    return Response.json(await auth(), { headers: { "Cache-Control": "private, no-store" } });
  }
  return handlers.GET(request);
}

export async function POST(request: NextRequest) {
  if (request.nextUrl.pathname.endsWith("/callback/credentials")) {
    const rejected = await enforceRateLimit("login-ip", clientAddress(request.headers), 20);
    if (rejected) return rejected;
  }
  try {
    const body = await readBoundedBody(request, 16 * 1024);
    return handlers.POST(new NextRequest(request.url, {
      method: request.method,
      headers: request.headers,
      body: body as Uint8Array<ArrayBuffer>,
    }));
  } catch (error) {
    return requestErrorResponse(error);
  }
}
