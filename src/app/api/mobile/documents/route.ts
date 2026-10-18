import { z } from "zod";
import { revalidatePath } from "next/cache";
import { mobileContext, getMobileSession } from "@/lib/mobile/session";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";

export async function POST(request: Request) {
  const ctx = await mobileContext();
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: (await getMobileSession()) ? 403 : 401 });
  const data = await request.formData();
  const parsed = z.object({ tenantId: z.string().min(1), type: z.enum(["AADHAAR_FRONT", "AADHAAR_BACK", "PAN", "PHOTO", "AGREEMENT", "OTHER"]) }).safeParse({ tenantId: data.get("tenantId"), type: data.get("type") });
  const file = data.get("file");
  if (!parsed.success || !(file instanceof File)) return Response.json({ error: "Choose a document and its type" }, { status: 400 });
  if (parsed.data.type === "PHOTO" && !file.type.startsWith("image/")) return Response.json({ error: "Choose an image for the tenant photo" }, { status: 400 });
  const tenant = await prisma.tenant.findFirst({ where: { id: parsed.data.tenantId, propertyId: ctx.property.id }, select: { id: true } });
  if (!tenant) return Response.json({ error: "Tenant not found" }, { status: 404 });
  let saved: Awaited<ReturnType<typeof storage.save>> | undefined;
  try {
    saved = await storage.save(file, "kyc");
    const stored = saved;
    await prisma.$transaction(async tx => {
      await tx.document.create({ data: { tenantId: tenant.id, type: parsed.data.type, storageKey: stored.key, filename: stored.filename, mimeType: stored.mimeType, size: stored.size } });
      if (parsed.data.type === "PHOTO") await tx.tenant.update({ where: { id: tenant.id }, data: { photoUrl: stored.key } });
    });
    revalidatePath(`/tenants/${tenant.id}`);
    return Response.json({ ok: true, data: { storageKey: saved.key } });
  } catch (error) {
    if (saved) await storage.remove(saved.key);
    return Response.json({ error: error instanceof Error ? error.message : "Could not upload the document" }, { status: 400 });
  }
}
