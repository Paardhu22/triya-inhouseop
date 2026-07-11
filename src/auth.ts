import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validations/auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({
          where: { email },
          include: { property: { select: { isActive: true } } },
        });
        if (!user || !user.isActive) return null;

        // MANAGER/TENANT accounts are scoped to one property. Block sign-in when that
        // property is missing or deactivated — this is how "delete" (deactivate)
        // locks a property's account out without removing the human record.
        // APP_OWNER (global) and PROPERTY_OWNER (multi-property via PropertyOwnership)
        // have no single propertyId, so they are exempt from this check.
        const scopedToOneProperty = user.role === "MANAGER" || user.role === "TENANT";
        if (scopedToOneProperty && !user.property?.isActive) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        // TEMP DEBUG — remove after Vercel "no properties" investigation
        console.log("[DEBUG] authorize() user id:", user.id);
        console.log("[DEBUG] authorize() user email:", user.email);
        console.log("[DEBUG] authorize() user role:", user.role);
        console.log("[DEBUG] authorize() user propertyId:", user.propertyId ?? "(none)");

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          image: user.image,
        };
      },
    }),
  ],
});
