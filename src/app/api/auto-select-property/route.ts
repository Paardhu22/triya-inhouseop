import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { PROPERTY_COOKIE, listProperties } from "@/lib/property";

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Picks a property for roles that don't need to choose (MANAGER is pinned to one;
 * APP_OWNER just wants straight into their platform dashboard) and sets the active
 * property cookie. A Route Handler — not the /select-property page itself — because
 * Next only allows mutating cookies in a Server Action or Route Handler, not during
 * a Server Component render.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user || session.user.role === "TENANT" || session.user.role === "PROPERTY_OWNER") {
    return NextResponse.redirect(new URL("/login", req.url), { status: 302 });
  }

  const properties = await listProperties();
  if (properties.length === 0) {
    return NextResponse.redirect(new URL("/select-property", req.url), { status: 302 });
  }

  const target = session.user.role === "APP_OWNER" ? "/app-owner-dashboard" : "/dashboard";
  const res = NextResponse.redirect(new URL(target, req.url), { status: 302 });
  res.cookies.set(PROPERTY_COOKIE, properties[0].id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR,
  });
  return res;
}
