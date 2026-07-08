import "server-only";

import { getExotelConfig } from "@/config/env";

/** Not configured (missing env vars) — never worth retrying. */
export class ExotelConfigError extends Error {}
/** Exotel rejected the request (bad number, auth, etc.) — not worth retrying. */
export class ExotelApiError extends Error {}
/** Network failure or 5xx from Exotel — safe to retry. */
export class ExotelTransientError extends Error {}

export type ExotelCallResult = { callSid: string; status: string };

/** Best-effort normalisation of an Indian number to E.164 (+91XXXXXXXXXX). */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
  return phone.startsWith("+") ? phone : `+${digits}`;
}

function extractErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const rec = body as Record<string, unknown>;
    const restException = rec.RestException as Record<string, unknown> | undefined;
    if (typeof restException?.Message === "string") return restException.Message;
    if (typeof rec.Message === "string") return rec.Message;
  }
  return fallback;
}

async function attemptCall(opts: {
  to: string;
  customField: string;
  statusCallbackUrl: string;
}): Promise<ExotelCallResult> {
  const config = getExotelConfig();
  if (!config) {
    throw new ExotelConfigError(
      "Exotel is not configured. Set EXOTEL_ACCOUNT_SID, EXOTEL_API_KEY, EXOTEL_API_TOKEN, " +
        "EXOTEL_SUBDOMAIN, EXOTEL_CALLER_ID and EXOTEL_APP_ID.",
    );
  }

  const url = `https://${config.subdomain}/v1/Accounts/${config.accountSid}/Calls/connect.json`;
  const auth = Buffer.from(`${config.apiKey}:${config.apiToken}`).toString("base64");
  // Url must point to a pre-built Exotel App/Flow (EXOTEL_FLOW_URL, from the Exotel
  // dashboard) — Exotel does not accept an arbitrary webhook here. CustomField is
  // echoed back as a query param to that Flow's Greeting applet, which is how our
  // /api/calls/exoml endpoint knows which Call row's message to read out.
  const body = new URLSearchParams({
    From: normalizePhone(opts.to),
    CallerId: config.callerId,
    CallType: "trans",
    Url: config.flowUrl,
    CustomField: opts.customField,
    StatusCallback: opts.statusCallbackUrl,
  });

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
  } catch (e) {
    throw new ExotelTransientError(e instanceof Error ? e.message : "Network error calling Exotel");
  }

  const json = await response.json().catch(() => null);

  if (!response.ok) {
    const message = extractErrorMessage(json, `Exotel API error (HTTP ${response.status})`);
    if (response.status >= 500) throw new ExotelTransientError(message);
    throw new ExotelApiError(message);
  }

  const call = (json as { Call?: { Sid?: string; Status?: string } } | null)?.Call;
  if (!call?.Sid) {
    throw new ExotelApiError(extractErrorMessage(json, "Exotel did not return a call SID"));
  }
  return { callSid: call.Sid, status: call.Status ?? "queued" };
}

/**
 * Place an outbound call via Exotel's Connect API: Exotel rings `to` first (shown
 * the `CallerId` ExoPhone), and once answered connects to the pre-built Flow at
 * EXOTEL_FLOW_URL, passing `customField` through so that Flow's Greeting applet can
 * fetch the right message from /api/calls/exoml. `statusCallbackUrl` receives live
 * status webhooks. Retries transient failures (network / 5xx) twice with a short
 * backoff; a rejected or misconfigured request fails immediately since retrying
 * can't fix it.
 */
export async function placeCall(opts: {
  to: string;
  customField: string;
  statusCallbackUrl: string;
}): Promise<ExotelCallResult> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await attemptCall(opts);
    } catch (e) {
      const isLastAttempt = attempt === maxAttempts;
      if (e instanceof ExotelTransientError && !isLastAttempt) {
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        continue;
      }
      throw e;
    }
  }
  // Unreachable — the loop always returns or throws.
  throw new ExotelApiError("Exotel call failed after retries");
}
