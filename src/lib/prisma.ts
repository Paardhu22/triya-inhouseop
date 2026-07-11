import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

// Prisma 7 uses the engine-less query compiler, so the runtime client connects
// through a driver adapter (node-postgres here). A single client is reused across
// hot reloads in development to avoid exhausting the connection pool.
// TEMP DEBUG — remove after Vercel "no properties" investigation
try {
  const u = new URL(process.env.DATABASE_URL ?? "");
  console.log(`[DEBUG] DB Host: ${u.hostname}`);
  console.log(`[DEBUG] Database: ${u.pathname.replace(/^\//, "")}`);
} catch {
  console.log("[DEBUG] DATABASE_URL is missing or unparsable");
}

const createPrismaClient = () =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
