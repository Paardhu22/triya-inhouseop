import type { NextAuthConfig } from "next-auth";

import type { Role } from "@/generated/prisma/client";

// Edge-safe config shared by the middleware and the full Node auth instance.
// It must NOT import Prisma, bcrypt or any Node-only modules at runtime; the
// credentials `authorize` (which does) lives in auth.ts.
export const authConfig = {
  secret: process.env.AUTH_SECRET || "7f6e2b9c3a8d7e6f0b1a2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f",
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
      return session;
    },
  },
} satisfies NextAuthConfig;
