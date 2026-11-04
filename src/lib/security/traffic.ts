import { clientAddress } from "./client-address";

/** Cheap per-instance backstop. Shared login/expensive-work limits live in Postgres. */
export class TrafficLimiter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();
  private lastSweep = 0;

  constructor(private readonly capacity = 10_000) {}

  check(key: string, limit: number, windowMs = 60_000, now = Date.now()) {
    if (now - this.lastSweep >= 30_000) {
      for (const [id, bucket] of this.buckets) if (bucket.resetAt <= now) this.buckets.delete(id);
      this.lastSweep = now;
    }
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      // Never evict a live bucket: that would let rotating identifiers reset limits.
      if (!bucket && this.buckets.size >= this.capacity) return { allowed: false, retryAfter: 30 };
      bucket = { count: 0, resetAt: now + windowMs };
      this.buckets.set(key, bucket);
    }
    bucket.count = Math.min(bucket.count + 1, limit + 1);
    return { allowed: bucket.count <= limit, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
}

const limiter = new TrafficLimiter();

export function screenRequest(request: Request): Response | null {
  const pathname = new URL(request.url).pathname;
  const bodyLength = request.headers.get("content-length");
  if (bodyLength && (!/^\d+$/.test(bodyLength) || Number(bodyLength) > 4 * 1024 * 1024)) {
    return Response.json({ error: "Request is too large" }, { status: 413 });
  }
  let scope = "page", limit = 180;
  if (pathname.startsWith("/api/")) { scope = "api"; limit = 180; }
  if (request.method === "POST") { scope = "write"; limit = 60; }
  if (pathname === "/api/mobile/snapshot") { scope = "snapshot"; limit = 12; }
  if (pathname === "/api/expenses/export") { scope = "export"; limit = 10; }
  if (request.method === "POST" && (pathname === "/api/mobile/login" || pathname === "/api/auth/callback/credentials")) {
    scope = "login"; limit = 20;
  }
  const result = limiter.check(`${scope}:${clientAddress(request.headers)}`, limit);
  return result.allowed ? null : Response.json({ error: "Too many requests. Please try again shortly." }, {
    status: 429, headers: { "Retry-After": String(result.retryAfter), "Cache-Control": "no-store" },
  });
}
