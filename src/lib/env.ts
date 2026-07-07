import "server-only";

import { z } from "zod";

// Central environment validation. Imported early (see src/instrumentation.ts) and by
// the auth-secret consumers, so a misconfigured deploy fails fast at startup instead
// of at the first request. DATABASE_URL and AUTH_SECRET are hard requirements; feature
// integrations (cron, Twilio, media URLs) degrade gracefully when their vars are unset.
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required"),

  CRON_SECRET: z.string().min(1).optional(),
  ALLOWED_ORIGINS: z.string().optional(),

  APP_PUBLIC_URL: z.string().optional(),
  STORAGE_DRIVER: z.string().optional(),
  STORAGE_LOCAL_DIR: z.string().optional(),
  STORAGE_MAX_FILE_MB: z.string().optional(),

  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_WHATSAPP_NUMBER: z.string().optional(),

  // AiSensy: template-based WhatsApp campaigns (rent reminders, complaint-resolved
  // notices, credential delivery) — separate from Twilio, which only handles the
  // invoice PDF media message.
  AISENSY_API_KEY: z.string().optional(),
  AISENSY_CAMPAIGN_RENT_REMINDER: z.string().optional(),
  AISENSY_CAMPAIGN_COMPLAINT_RESOLVED: z.string().optional(),
  AISENSY_CAMPAIGN_CREDENTIALS: z.string().optional(),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return parsed.data;
}

export const env = loadEnv();
