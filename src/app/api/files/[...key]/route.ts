import { auth } from "@/auth";
import { storage } from "@/lib/storage";

// Serves uploaded KYC documents/photos. Requires an authenticated session so
// sensitive files are never publicly accessible.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { key } = await params;
  const file = await storage.read(key.join("/"));
  if (!file) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mimeType,
      "Cache-Control": "private, max-age=300",
    },
  });
}
