import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

/**
 * The public endpoints are called only by the website's server. Authenticate that
 * server with a shared secret (constant-time compare) and fail closed when unset.
 */
export function verifyWebsiteSecret(request: Request): "ok" | "unconfigured" | "denied" {
  const secret = process.env.PUBLIC_REGISTRATION_SECRET;
  if (!secret || secret.length < 32) return "unconfigured";
  const provided = request.headers.get("x-registration-secret") ?? "";
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b) ? "ok" : "denied";
}

/** End-visitor IP, as forwarded by the (authenticated) website server. */
export function forwardedClientIp(request: Request): string {
  const candidate = request.headers.get("x-registration-client-ip")?.trim() ?? "";
  return isIP(candidate) ? candidate : "unknown";
}
