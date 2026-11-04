import NextAuth from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { authConfig } from "@/auth.config";
import { screenRequest } from "@/lib/security/traffic";

const { auth } = NextAuth(authConfig);

// Next.js 16 renamed Middleware to Proxy and requires a statically recognizable
// function export named `proxy` (or a default export) — a destructured `const`
// export is not detected. We delegate to Auth.js's `auth` handler, which runs
// the `authorized` callback for every matched request.
const handler = auth as unknown as (
  ...args: unknown[]
) => Response | Promise<Response | undefined> | undefined;

export default function proxy(request: NextRequest, ...args: unknown[]) {
  const rejected = screenRequest(request);
  if (rejected) return rejected;
  // API routes validate their own browser/bearer/signed-file authorization.
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();
  return handler(request, ...args);
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|icon.ico|logo\\.png|logo-removebg-preview\\.png|next\\.svg|globe\\.svg|file\\.svg|vercel\\.svg|window\\.svg).*)"],
};
