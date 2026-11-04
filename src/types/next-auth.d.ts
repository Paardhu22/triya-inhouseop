import type { DefaultSession } from "next-auth";

import type { Role } from "@/generated/prisma/client";

declare module "next-auth" {
  interface Session {
    sessionVersion?: string;
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    sessionVersion?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    sessionVersion?: string;
  }
}
