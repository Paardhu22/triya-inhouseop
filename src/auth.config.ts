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
      const isLoggedIn = Boolean(auth?.user && auth.sessionVersion);
      const isOnLogin = nextUrl.pathname === "/login";

      if (isOnLogin) {
        // The login page checks the live account. Redirecting here using only a
        // JWT would cause a redirect loop for revoked/deactivated sessions.
        return true;
      }

      // Every other matched route requires authentication.
      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id ?? token.id;
        token.role = (user as { role?: Role }).role ?? token.role;
        token.sessionVersion = user.sessionVersion;
      }
      return token;
    },
    session({ session, token }) {
      session.sessionVersion = typeof token.sessionVersion === "string" ? token.sessionVersion : undefined;
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
