import { auth } from "@/auth";
import { verifyFileToken } from "@/lib/file-token";
import { storage } from "@/lib/storage";

// Serves uploaded KYC documents/photos. Access requires either an authenticated
// session OR a short-lived signed URL (so external services like Twilio can fetch
// a specific invoice file without a session). Files are never publicly listable.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const keyStr = key.join("/");

  const session = await auth();
  let authorized = Boolean(session?.user);

  if (!authorized) {
    const { searchParams } = new URL(req.url);
    authorized = verifyFileToken(
      keyStr,
      Number(searchParams.get("exp")),
      searchParams.get("sig"),
    );
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
      "Cache-Control": "private, max-age=300",
    },
  });
}
