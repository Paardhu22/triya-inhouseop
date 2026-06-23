import NextAuth from "next-auth";

import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

// Next.js 16 renamed Middleware to Proxy and requires a statically recognizable
// function export named `proxy` (or a default export) — a destructured `const`
// export is not detected. We delegate to Auth.js's `auth` handler, which runs
// the `authorized` callback for every matched request.
const handler = auth as unknown as (
  ...args: unknown[]
) => Response | Promise<Response | undefined> | undefined;

export default function proxy(...args: unknown[]) {
  return handler(...args);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
