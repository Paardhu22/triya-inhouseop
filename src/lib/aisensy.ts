import "server-only";

const AISENSY_ENDPOINT = "https://backend.aisensy.com/campaign/t1/api/v2";

/** Best-effort normalisation of an Indian number to AiSensy's `91XXXXXXXXXX` format. */
function toAiSensyDestination(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return digits;
}

/**
 * Send a WhatsApp message through an AiSensy campaign (template-based — the
 * campaign/template must already exist and be approved in the AiSensy dashboard;
 * this cannot send arbitrary free text). Best-effort by design: callers should
 * treat failures as non-fatal (log, don't block the underlying action) since a
 * WhatsApp delivery hiccup should never break rent tracking, complaint resolution,
 * or onboarding.
 */
export async function sendAiSensyCampaign(opts: {
  campaignName: string;
  phone: string;
  userName: string;
  templateParams?: string[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.AISENSY_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "AiSensy is not configured. Set AISENSY_API_KEY." };
  }

  try {
    const res = await fetch(AISENSY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey,
        campaignName: opts.campaignName,
        destination: toAiSensyDestination(opts.phone),
        userName: opts.userName,
        templateParams: opts.templateParams ?? [],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `AiSensy request failed (${res.status}): ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "AiSensy request failed" };
  }
}

/** Rent due in `daysUntilDue` days (negative/0 = due today or overdue). */
export async function sendRentReminder(opts: {
  phone: string;
  userName: string;
  amountLabel: string;
  daysUntilDue: number;
}) {
  const campaignName = process.env.AISENSY_CAMPAIGN_RENT_REMINDER;
  if (!campaignName) return { ok: false as const, error: "AISENSY_CAMPAIGN_RENT_REMINDER not set" };
  const dueLabel =
    opts.daysUntilDue > 0 ? `in ${opts.daysUntilDue} day${opts.daysUntilDue === 1 ? "" : "s"}` : "today or overdue";
  return sendAiSensyCampaign({
    campaignName,
    phone: opts.phone,
    userName: opts.userName,
    templateParams: [opts.userName, opts.amountLabel, dueLabel],
  });
}

/** Notify a tenant that their complaint has been resolved. */
export async function sendComplaintResolvedNotice(opts: {
  phone: string;
  userName: string;
  complaintTitle: string;
}) {
  const campaignName = process.env.AISENSY_CAMPAIGN_COMPLAINT_RESOLVED;
  if (!campaignName) return { ok: false as const, error: "AISENSY_CAMPAIGN_COMPLAINT_RESOLVED not set" };
  return sendAiSensyCampaign({
    campaignName,
    phone: opts.phone,
    userName: opts.userName,
    templateParams: [opts.userName, opts.complaintTitle],
  });
}

/** Deliver a freshly-created login's email + password over WhatsApp. */
export async function sendLoginCredentials(opts: {
  phone: string;
  userName: string;
  email: string;
  password: string;
}) {
  const campaignName = process.env.AISENSY_CAMPAIGN_CREDENTIALS;
  if (!campaignName) return { ok: false as const, error: "AISENSY_CAMPAIGN_CREDENTIALS not set" };
  return sendAiSensyCampaign({
    campaignName,
    phone: opts.phone,
    userName: opts.userName,
    templateParams: [opts.userName, opts.email, opts.password],
  });
}
