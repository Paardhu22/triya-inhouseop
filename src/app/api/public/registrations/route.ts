import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { readFormBody, requestErrorResponse } from "@/lib/security/request";
import { forwardedClientIp, verifyWebsiteSecret } from "@/lib/registrations/public-guard";
import {
  CONSENT_VERSION,
  MAX_PENDING_PER_PROPERTY,
  PUBLIC_KYC_MAX_BYTES,
  PUBLIC_KYC_MIME_TYPES,
  publicRegistrationSchema,
} from "@/lib/registrations/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const json = (body: unknown, status: number) => Response.json(body, { status, headers: NO_STORE });

/**
 * Public tenant registration. Server-to-server only: the website's server authenticates
 * with PUBLIC_REGISTRATION_SECRET. Creates a PENDING request, never a tenant. The visitor
 * controls only their own details; the property comes from the explicit websiteSlug
 * mapping, and room/bed/charges/status are never read from the request.
 */
export async function POST(request: Request) {
  const guard = verifyWebsiteSecret(request);
  if (guard === "unconfigured") return json({ error: "Registration is not available" }, 503);
  if (guard === "denied") return json({ error: "Unauthorized" }, 401);

  const ip = forwardedClientIp(request);
  const limited =
    (await enforceRateLimit("reg-ip", ip, 5, 60 * 60_000)) ??
    (await enforceRateLimit("reg-global", "all", 300, 60 * 60_000));
  if (limited) return limited;

  let form: FormData;
  try {
    // Counts real bytes read (not just Content-Length); 4 MB covers the 3 MB image + fields.
    form = await readFormBody(request, 4 * 1024 * 1024);
  } catch (error) {
    return requestErrorResponse(error);
  }

  // Honeypot: bots fill hidden fields. Pretend success, store nothing.
  const honeypot = form.get("company");
  if (typeof honeypot === "string" && honeypot.trim() !== "") return json({ ok: true, status: "created" }, 201);

  const text = (key: string) => {
    const v = form.get(key);
    return typeof v === "string" ? v : undefined;
  };
  const parsed = publicRegistrationSchema.safeParse({
    websiteSlug: text("websiteSlug"),
    fullName: text("fullName"),
    phone: text("phone"),
    email: text("email"),
    preferredCheckIn: text("preferredCheckIn"),
    consent: text("consent"),
  });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) fields[String(issue.path[0] ?? "form")] ??= issue.message;
    return json({ error: "Please check the highlighted details", fields }, 400);
  }
  const input = parsed.data;

  // Never trust client-supplied ownership: resolve the property from the explicit mapping.
  const property = await prisma.property.findFirst({
    where: { websiteSlug: input.websiteSlug, isActive: true },
    select: { id: true },
  });
  if (!property) return json({ error: "This property is not accepting online registrations" }, 404);

  const phoneLimited = await enforceRateLimit("reg-phone", `${property.id}:${input.phone}`, 3, 24 * 60 * 60_000);
  if (phoneLimited) return phoneLimited;

  const existing = await prisma.registrationRequest.findFirst({
    where: { propertyId: property.id, phone: input.phone, status: "PENDING" },
    select: { id: true },
  });
  if (existing) return json({ ok: true, status: "duplicate" }, 200);

  const photo = form.get("photo");
  let saved: Awaited<ReturnType<typeof storage.save>> | null = null;
  if (photo instanceof File && photo.size > 0) {
    if (photo.size > PUBLIC_KYC_MAX_BYTES) return json({ error: "Image must be 3 MB or smaller", fields: { photo: "Image must be 3 MB or smaller" } }, 413);
    if (!(PUBLIC_KYC_MIME_TYPES as readonly string[]).includes(photo.type)) {
      return json({ error: "Upload a JPG, PNG or WebP image", fields: { photo: "Upload a JPG, PNG or WebP image" } }, 415);
    }
    try {
      // storage.save re-checks size and verifies the magic bytes match the declared type.
      saved = await storage.save(photo, "registrations");
    } catch {
      return json({ error: "That image could not be accepted", fields: { photo: "That image could not be accepted" } }, 422);
    }
  }

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      // Serialise concurrent submissions for the same property+phone.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`reg:${property.id}:${input.phone}`}))`;
      const dup = await tx.registrationRequest.findFirst({
        where: { propertyId: property.id, phone: input.phone, status: "PENDING" },
        select: { id: true },
      });
      if (dup) return "duplicate" as const;
      const pending = await tx.registrationRequest.count({ where: { propertyId: property.id, status: "PENDING" } });
      if (pending >= MAX_PENDING_PER_PROPERTY) return "full" as const;
      await tx.registrationRequest.create({
        data: {
          propertyId: property.id,
          fullName: input.fullName,
          phone: input.phone,
          email: input.email ?? null,
          preferredCheckIn: input.preferredCheckIn ? new Date(`${input.preferredCheckIn}T00:00:00.000Z`) : null,
          kycKey: saved?.key ?? null,
          kycFilename: saved ? saved.filename.slice(0, 120) : null,
          kycMimeType: saved?.mimeType ?? null,
          kycSize: saved?.size ?? null,
          consentAt: new Date(),
          consentVersion: CONSENT_VERSION,
        },
      });
      return "created" as const;
    });

    if (outcome !== "created" && saved) await storage.remove(saved.key);
    if (outcome === "duplicate") return json({ ok: true, status: "duplicate" }, 200);
    if (outcome === "full") return json({ error: "Registrations are temporarily unavailable. Please contact us directly." }, 503);
    return json({ ok: true, status: "created" }, 201);
  } catch (error) {
    if (saved) await storage.remove(saved.key);
    // Never log the body or file: names/phones/KYC are personal data.
    console.error("Public registration failed", error instanceof Error ? error.name : "unknown");
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}
