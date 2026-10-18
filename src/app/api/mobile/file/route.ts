import { mobileContext, getMobileSession } from "@/lib/mobile/session";
import { propertyOwnsFile } from "@/lib/mobile/files";
import { prisma } from "@/lib/prisma";
import { signFileToken } from "@/lib/file-token";

/** Private files use the shared local/Supabase driver; clients receive short-lived access. */
export async function GET(request: Request) {
  const session = await getMobileSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const key = params.get("key");
  if (!key) return Response.json({ error: "File required" }, { status: 400 });
  const logoPropertyId = params.get("logoPropertyId");
  if (logoPropertyId) {
    // Property selection happens before an active property exists. Only its logo is readable here.
    if (session.user.role !== "ADMIN" && session.user.propertyId !== logoPropertyId) {
      return Response.json({ error: "File not found" }, { status: 404 });
    }
    const property = await prisma.property.findFirst({ where: { id: logoPropertyId, isActive: true, logoKey: key }, select: { id: true } });
    if (!property) return Response.json({ error: "File not found" }, { status: 404 });
  } else {
    const ctx = await mobileContext();
    if (!ctx) return Response.json({ error: "Select an accessible property" }, { status: 403 });
    if (!(await propertyOwnsFile(ctx.property.id, key))) return Response.json({ error: "File not found" }, { status: 404 });
  }
  const { exp, sig } = signFileToken(key);
  return Response.json({ path: `/api/files/${key.split("/").map(encodeURIComponent).join("/")}?exp=${exp}&sig=${sig}` }, { headers: { "Cache-Control": "no-store" } });
}
