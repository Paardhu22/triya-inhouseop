import { headers } from "next/headers";
import { cache } from "react";
import { getMobileSession } from "@/lib/mobile/session";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";
import { authenticateCredentials, credentialVersion } from "@/lib/security/credentials";

export const { handlers, auth: webAuth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials, request) => {
        const user = await authenticateCredentials(credentials, request.headers);
        if (!user) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          image: user.image,
          sessionVersion: credentialVersion(user.passwordHash),
        };
      },
    }),
  ],
});

/** Existing actions work for both Auth.js browser sessions and mobile bearer sessions. */
export const auth = cache(async () => {
  if ((await headers()).has("authorization")) return getMobileSession();
  const session = await webAuth();
  if (!session?.user?.id || !session.sessionVersion) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, name: true, email: true, isActive: true, passwordHash: true, property: { select: { isActive: true } } },
  });
  if (!user?.isActive || (user.role !== "ADMIN" && !user.property?.isActive)) return null;
  if (session.sessionVersion !== credentialVersion(user.passwordHash)) return null;
  session.user = { ...session.user, id: user.id, role: user.role, name: user.name, email: user.email };
  return session;
});
