import type { NextAuthConfig } from "next-auth";

import type { Role } from "@/generated/prisma/client";
import { env } from "@/lib/env";

// Edge-safe config shared by the middleware and the full Node auth instance.
// It must NOT import Prisma, bcrypt or any Node-only modules at runtime; the
// credentials `authorize` (which does) lives in auth.ts.
export const authConfig = {
  secret: env.AUTH_SECRET,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = Boolean(auth?.user);
      const isOnLogin = nextUrl.pathname === "/login";

      if (isOnLogin) {
        if (isLoggedIn) {
          return Response.redirect(new URL("/dashboard", nextUrl));
        }
        return true;
      }

      // Every other matched route requires authentication.
      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id ?? token.id;
        token.role = (user as { role?: Role }).role ?? token.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
      }
      // TEMP DEBUG — remove after Vercel "no properties" investigation
      console.log("[DEBUG] session() user id:", session.user?.id);
      console.log("[DEBUG] session() user email:", session.user?.email);
      console.log("[DEBUG] session() user role:", session.user?.role);
      if (!session.user) {
        console.log("[DEBUG] SESSION USER MISSING");
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
