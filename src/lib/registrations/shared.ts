import { z } from "zod";

/** Bump when the privacy/consent wording on the public form changes. */
export const CONSENT_VERSION = "2026-11-v1";
/** Public KYC uploads: images only, below Vercel's request-body ceiling. */
export const PUBLIC_KYC_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const PUBLIC_KYC_MAX_BYTES = 3 * 1024 * 1024;
/** Retention: unreviewed requests expire; closed requests are purged. */
export const PENDING_EXPIRY_DAYS = 30;
export const CLOSED_PURGE_DAYS = 90;
/** Hard cap so a flood cannot grow the pending queue without bound. */
export const MAX_PENDING_PER_PROPERTY = 500;

export const WEBSITE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Reduce +91 / 91 / 0 prefixed Indian mobiles to the bare 10 digits; null if invalid. */
export function normalizePhone(raw: string): string | null {
  const stripped = raw.replace(/[\s-]/g, "");
  const match = /^(?:\+91|91|0)?([6-9]\d{9})$/.exec(stripped);
  return match ? match[1] : null;
}

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const publicRegistrationSchema = z.object({
  websiteSlug: z.string().trim().min(2).max(80).regex(WEBSITE_SLUG_PATTERN),
  fullName: z.string().trim().min(2, "Enter your full name").max(120),
  phone: z.string().trim().max(20).transform((v, ctx) => {
    const normalized = normalizePhone(v);
    if (!normalized) ctx.addIssue({ code: "custom", message: "Enter a valid 10-digit phone number" });
    return normalized ?? "";
  }),
  email: z.preprocess(blank, z.string().trim().max(254).email("Enter a valid email").optional()),
  preferredCheckIn: z.preprocess(blank, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date").optional())
    .refine((v) => {
      if (!v) return true;
      const d = new Date(`${v}T00:00:00.000Z`);
      if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return false;
      const today = Date.now();
      return d.getTime() >= today - 2 * 86_400_000 && d.getTime() <= today + 366 * 86_400_000;
    }, "Choose a check-in date within the next year"),
  consent: z.literal("true", { error: "Please accept the privacy notice to continue" }),
});
export type PublicRegistrationInput = z.infer<typeof publicRegistrationSchema>;
