import "server-only";

import { z } from "zod";

// Central environment validation. Imported early (see src/instrumentation.ts) and by
// the auth-secret consumers, so a misconfigured deploy fails fast at startup instead
// of at the first request. DATABASE_URL and AUTH_SECRET are hard requirements; feature
// integrations (cron, Twilio, media URLs) degrade gracefully when their vars are unset.
// Optional integrations may be left blank in local .env files.
const optionalSetting = <T extends z.ZodType>(schema: T) =>
  z.preprocess(value => typeof value === "string" && value.trim() === "" ? undefined : value, schema.optional());

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_URL: optionalSetting(z.string().min(1)),
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required"),

  CRON_SECRET: optionalSetting(z.string().min(1)),
  ALLOWED_ORIGINS: z.string().optional(),

  APP_PUBLIC_URL: z.string().optional(),
  STORAGE_DRIVER: z.string().optional(),
  STORAGE_LOCAL_DIR: z.string().optional(),
  STORAGE_MAX_FILE_MB: z.string().optional(),

  NEXT_PUBLIC_SUPABASE_URL: optionalSetting(z.string().url()),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optionalSetting(z.string().min(1)),
  SUPABASE_SERVICE_ROLE_KEY: optionalSetting(z.string().min(1)),
  SUPABASE_STORAGE_BUCKET: optionalSetting(z.string().min(1)),

  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_WHATSAPP_NUMBER: z.string().optional(),
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
