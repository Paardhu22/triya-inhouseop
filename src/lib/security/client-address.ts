import { isIP } from "node:net";

/** Trust forwarded addresses only when Vercel supplies/overwrites the headers. */
export function clientAddress(headers: Headers): string {
  if (process.env.VERCEL !== "1") return "local";
  const candidate = (headers.get("x-vercel-forwarded-for") ?? headers.get("x-forwarded-for"))?.split(",")[0].trim();
  return candidate && isIP(candidate) ? candidate : "unknown";
}
