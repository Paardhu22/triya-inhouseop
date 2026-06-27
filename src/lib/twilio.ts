import "server-only";

import twilio from "twilio";

// Server-only Twilio client. Credentials come from the environment and are never
// imported into a client bundle (guarded by "server-only").
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;

let client: ReturnType<typeof twilio> | null = null;

/** Lazily-built singleton client. Throws a clear error when unconfigured. */
function getClient(): ReturnType<typeof twilio> {
  if (!accountSid || !authToken) {
    throw new Error(
      "Twilio is not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.",
    );
  }
  if (!client) client = twilio(accountSid, authToken);
  return client;
}

/**
 * Normalise the configured sender to a `whatsapp:+E164` address, tolerating a value
 * that already carries the `whatsapp:` prefix (avoids a `whatsapp:whatsapp:` "Invalid
 * From" error).
 */
function fromAddress(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("whatsapp:") ? trimmed : `whatsapp:${trimmed}`;
}

/** Best-effort normalisation of an Indian number to a `whatsapp:+E164` address. */
export function toWhatsAppAddress(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  let e164: string;
  if (digits.length === 10) e164 = `+91${digits}`;
  else if (digits.length === 12 && digits.startsWith("91")) e164 = `+${digits}`;
  else if (digits.length === 11 && digits.startsWith("0")) e164 = `+91${digits.slice(1)}`;
  else e164 = `+${digits}`;
  return `whatsapp:${e164}`;
}

/** Send a WhatsApp message with a single media attachment. Returns the message SID. */
export async function sendWhatsAppMedia(opts: {
  to: string;
  body: string;
  mediaUrl: string;
}): Promise<string> {
  if (!whatsappNumber) {
    throw new Error("Twilio is not configured. Set TWILIO_WHATSAPP_NUMBER.");
  }
  const message = await getClient().messages.create({
    from: fromAddress(whatsappNumber),
    to: toWhatsAppAddress(opts.to),
    body: opts.body,
    mediaUrl: [opts.mediaUrl],
  });
  return message.sid;
}
