import { propertyOwnsFile } from "@/lib/mobile/files";
import { auth } from "@/auth";
import { verifyFileToken } from "@/lib/file-token";
import { storage } from "@/lib/storage";
import { accessiblePropertyWhere, getActiveProperty } from "@/lib/property";
import { prisma } from "@/lib/prisma";

// Serves uploaded KYC documents/photos. Access requires either an authenticated
// session OR a short-lived signed URL (so external services like Twilio can fetch
// a specific invoice file without a session). Files are never publicly listable.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const keyStr = key.join("/");
  if (!/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(keyStr) || keyStr.length > 300) {
    return new Response("Not found", { status: 404 });
  }

  // A valid, file-specific signature needs no session/database lookups (Twilio).
  const { searchParams } = new URL(req.url);
  let authorized = verifyFileToken(keyStr, Number(searchParams.get("exp")), searchParams.get("sig"));
  if (!authorized && (await auth())?.user) {
    const property = await getActiveProperty();
    authorized = Boolean(property && await propertyOwnsFile(property.id, keyStr));
    // The property picker renders accessible logos before a property is selected.
    if (!authorized && keyStr.startsWith("logos/")) {
      const scope = await accessiblePropertyWhere();
      authorized = Boolean(scope && await prisma.property.findFirst({
        where: { ...scope, isActive: true, logoKey: keyStr }, select: { id: true },
      }));
    }
  }

  if (!authorized) {
    return new Response("Unauthorized", { status: 401 });
  }

  const file = await storage.read(keyStr);
  if (!file) {
    return new Response("Not found", { status: 404 });
  }

  // Inline disposition + explicit length so clients and external fetchers (Twilio
  // pulling an invoice PDF) handle the response reliably.
  const filename = keyStr.split("/").pop() || "file";
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(file.data.byteLength),
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'self'; sandbox",
    },
  });
}
