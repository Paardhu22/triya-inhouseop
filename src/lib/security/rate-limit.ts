import "server-only";

import { createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

export { clientAddress } from "./client-address";

/** Atomic, shared across all serverless instances; identifiers are never stored raw. */
export async function consumeRateLimit(scope: string, identifier: string, limit: number, windowMs: number) {
  const key = createHmac("sha256", env.AUTH_SECRET).update(`${scope}:${identifier}`).digest("hex");
  const [bucket] = await prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
    VALUES (${key}, 1, CURRENT_TIMESTAMP + (${windowMs} * INTERVAL '1 millisecond'))
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."resetAt" <= CURRENT_TIMESTAMP THEN 1
        ELSE LEAST("RateLimitBucket"."count" + 1, ${limit + 1}) END,
      "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= CURRENT_TIMESTAMP
        THEN CURRENT_TIMESTAMP + (${windowMs} * INTERVAL '1 millisecond') ELSE "RateLimitBucket"."resetAt" END
    RETURNING "count", "resetAt"
  `;
  return { allowed: bucket.count <= limit, retryAfter: Math.max(1, Math.ceil((bucket.resetAt.getTime() - Date.now()) / 1000)) };
}

/** Fail closed when the limiter/database is unavailable; do not run expensive work. */
export async function enforceRateLimit(scope: string, identifier: string, limit: number, windowMs = 60_000): Promise<Response | null> {
  try {
    const result = await consumeRateLimit(scope, identifier, limit, windowMs);
    if (result.allowed) return null;
    return Response.json({ error: "Too many requests. Please try again shortly." }, {
      status: 429, headers: { "Retry-After": String(result.retryAfter), "Cache-Control": "no-store" },
    });
  } catch {
    console.error("Rate limit storage unavailable", { scope });
    return Response.json({ error: "Service temporarily unavailable. Please try again shortly." }, {
      status: 503, headers: { "Retry-After": "5", "Cache-Control": "no-store" },
    });
  }
}
