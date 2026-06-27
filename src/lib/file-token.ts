import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

// Short-lived, HMAC-signed access tokens for the otherwise session-protected file
// API. Lets a specific stored file be fetched by an external service (e.g. Twilio
// pulling an invoice media URL) without ever exposing a long-lived public link.
const SECRET = process.env.AUTH_SECRET ?? "";

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("hex");
}

/** Signature + expiry (unix seconds) for a single storage key. */
export function signFileToken(key: string, ttlSeconds = 600): { exp: number; sig: string } {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return { exp, sig: sign(`${key}.${exp}`) };
}

/** True when the signature matches the key+exp and the token has not expired. */
export function verifyFileToken(key: string, exp: number, sig: string | null): boolean {
  if (!sig || !Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const expected = Buffer.from(sign(`${key}.${exp}`));
  const provided = Buffer.from(sig);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}
