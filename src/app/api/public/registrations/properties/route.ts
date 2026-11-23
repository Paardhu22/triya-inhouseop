import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { forwardedClientIp, verifyWebsiteSecret } from "@/lib/registrations/public-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Website slugs of active properties explicitly mapped to accept registrations. */
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const guard = verifyWebsiteSecret(request);
  if (guard === "unconfigured") return Response.json({ slugs: [] }, { status: 503, headers });
  if (guard === "denied") return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  const limited = await enforceRateLimit("reg-list", forwardedClientIp(request), 120);
  if (limited) return limited;
  const rows = await prisma.property.findMany({
    where: { isActive: true, websiteSlug: { not: null } },
    select: { websiteSlug: true },
  });
  return Response.json({ slugs: rows.map((r) => r.websiteSlug).filter(Boolean) }, { headers });
}
