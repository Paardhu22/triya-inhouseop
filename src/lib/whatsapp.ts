import "server-only";

// GreenAPI WhatsApp integration — replaces the old AiSensy (template-only) and
// Twilio (media-only) split with a single provider that can send both free-text
// and file messages. Server-only; credentials never reach the client.
const ID_INSTANCE = process.env.GREENAPI_ID_INSTANCE;
const API_TOKEN_INSTANCE = process.env.GREENAPI_API_TOKEN_INSTANCE;
const API_URL = process.env.GREENAPI_API_URL;

function configured(): boolean {
  return Boolean(ID_INSTANCE && API_TOKEN_INSTANCE && API_URL);
}

/** Best-effort normalisation of an Indian number to a GreenAPI `<digits>@c.us` chat id. */
function toChatId(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  let national: string;
  if (digits.length === 10) national = `91${digits}`;
  else if (digits.length === 12 && digits.startsWith("91")) national = digits;
  else if (digits.length === 11 && digits.startsWith("0")) national = `91${digits.slice(1)}`;
  else national = digits;
  return `${national}@c.us`;
}

async function callGreenApi(method: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!configured()) {
    throw new Error(
      "WhatsApp is not configured. Set GREENAPI_ID_INSTANCE, GREENAPI_API_TOKEN_INSTANCE, GREENAPI_API_URL.",
    );
  }
  const res = await fetch(`${API_URL}/waInstance${ID_INSTANCE}/${method}/${API_TOKEN_INSTANCE}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok) {
    const message = typeof data?.message === "string" ? data.message : `GreenAPI ${method} failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

/** Send a plain WhatsApp text message. Best-effort by design — never throws. */
export async function sendWhatsAppText(
  phone: string,
  message: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await callGreenApi("sendMessage", { chatId: toChatId(phone), message });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "WhatsApp send failed" };
  }
}

/**
 * Send a WhatsApp message with a single file attachment (e.g. an invoice PDF) via a
 * publicly-reachable URL. Returns GreenAPI's message id. Throws on failure — callers
 * (invoice send/resend) treat that as a hard failure, not best-effort.
 */
export async function sendWhatsAppMedia(opts: { to: string; body: string; mediaUrl: string }): Promise<string> {
  const fileName = opts.mediaUrl.split("/").pop()?.split("?")[0] || "file.pdf";
  const data = await callGreenApi("sendFileByUrl", {
    chatId: toChatId(opts.to),
    urlFile: opts.mediaUrl,
    fileName,
    caption: opts.body,
  });
  return String(data.idMessage ?? "");
}

/** Rent due in `daysUntilDue` days (negative/0 = due today or overdue). */
export async function sendRentReminder(opts: {
  phone: string;
  userName: string;
  amountLabel: string;
  daysUntilDue: number;
}) {
  const dueLabel =
    opts.daysUntilDue > 0 ? `in ${opts.daysUntilDue} day${opts.daysUntilDue === 1 ? "" : "s"}` : "today or overdue";
  return sendWhatsAppText(
    opts.phone,
    `Hi ${opts.userName}, this is a reminder that your rent of ${opts.amountLabel} is due ${dueLabel}. Please pay at your earliest convenience.`,
  );
}

/** Notify a tenant that their complaint has been resolved. */
export async function sendComplaintResolvedNotice(opts: {
  phone: string;
  userName: string;
  complaintTitle: string;
}) {
  return sendWhatsAppText(
    opts.phone,
    `Hi ${opts.userName}, your complaint "${opts.complaintTitle}" has been marked as resolved. Please reach out if the issue persists.`,
  );
}

/** Deliver a freshly-created login's email + password over WhatsApp. */
export async function sendLoginCredentials(opts: {
  phone: string;
  userName: string;
  email: string;
  password: string;
}) {
  return sendWhatsAppText(
    opts.phone,
    `Hi ${opts.userName}, your DAZZ Manager login is ready.\nEmail: ${opts.email}\nPassword: ${opts.password}\n\nPlease sign in and change your password.`,
  );
}
