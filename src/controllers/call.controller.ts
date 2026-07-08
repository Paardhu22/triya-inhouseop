import "server-only";

import type { CallStatus } from "@/generated/prisma/client";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/prisma";
import { resolvePublicBaseUrl } from "@/lib/public-url";
import { ExotelApiError, ExotelConfigError, placeCall } from "@/services/exotel.service";

function log(event: string, details: Record<string, unknown>) {
  console.info(`[calls] ${event}`, details);
}

function buildTestMessage(tenantName: string, propertyName: string): string {
  return (
    `Hello ${tenantName}. This is a test call from ${propertyName}. ` +
    "We are currently testing our AI calling system. No action is required. " +
    "Thank you and have a great day."
  );
}

/**
 * Fetch the tenant, generate the test message, and place the Exotel call. Creates
 * the Call row up front (status CALLING) so a failure mid-flight still leaves an
 * auditable, UI-pollable record instead of vanishing silently.
 */
export async function createCall(
  tenantId: string,
  propertyId: string,
): Promise<ActionResult<{ callId: string; callSid: string; status: CallStatus }>> {
  const [tenant, property] = await Promise.all([
    prisma.tenant.findFirst({
      where: { id: tenantId, propertyId },
      select: { id: true, fullName: true, phone: true },
    }),
    prisma.property.findUnique({ where: { id: propertyId }, select: { name: true } }),
  ]);
  if (!tenant) return actionError("Tenant not found for this property");
  if (!property) return actionError("No active property selected");
  if (!tenant.phone) return actionError("Tenant has no phone number on file");

  const baseUrl = resolvePublicBaseUrl();
  if (!baseUrl.ok) return actionError(baseUrl.error);

  const message = buildTestMessage(tenant.fullName, property.name);

  const call = await prisma.call.create({
    data: { propertyId, tenantId: tenant.id, phone: tenant.phone, message, status: "CALLING" },
  });
  log("Call Started", { callId: call.id, tenantId: tenant.id, phone: tenant.phone });

  try {
    const result = await placeCall({
      to: tenant.phone,
      customField: call.id,
      statusCallbackUrl: `${baseUrl.base}/api/calls/${call.id}/status`,
    });
    await prisma.call.update({ where: { id: call.id }, data: { callSid: result.callSid } });
    return actionOk({ callId: call.id, callSid: result.callSid, status: "CALLING" as CallStatus });
  } catch (e) {
    const message =
      e instanceof ExotelConfigError || e instanceof ExotelApiError
        ? e.message
        : e instanceof Error
          ? e.message
          : "Failed to place the call";
    await prisma.call.update({ where: { id: call.id }, data: { status: "FAILED", error: message } });
    log("Call Failed", { callId: call.id, error: message });
    return actionError(message);
  }
}

/** Poll target for the frontend's status indicator. */
export async function getCallStatus(
  callId: string,
  propertyId: string,
): Promise<ActionResult<{ status: CallStatus; error: string | null }>> {
  const call = await prisma.call.findFirst({
    where: { id: callId, propertyId },
    select: { status: true, error: true },
  });
  if (!call) return actionError("Call not found");
  return actionOk({ status: call.status, error: call.error });
}

/**
 * Fetched by the Greeting applet inside the pre-built Exotel Flow (EXOTEL_FLOW_URL)
 * once the call is answered — NOT called directly by Exotel's API. Exotel echoes back
 * whatever `CustomField` we set at call creation (our Call id), falling back to
 * `CallSid` in case a Flow strips CustomField. Must return plain text (see
 * src/services/exotel.service.ts) — Exotel's TTS engine reads this back verbatim.
 */
export async function getCallMessage(opts: { customField: string | null; callSid: string | null }): Promise<string> {
  const call = opts.customField
    ? await prisma.call.findUnique({ where: { id: opts.customField }, select: { id: true, message: true, status: true } })
    : opts.callSid
      ? await prisma.call.findFirst({ where: { callSid: opts.callSid }, select: { id: true, message: true, status: true } })
      : null;
  if (!call) return "This call could not be identified. Goodbye.";

  if (call.status === "CALLING") {
    await prisma.call.update({ where: { id: call.id }, data: { status: "CONNECTED" } });
    log("Call Connected", { callId: call.id });
  }
  return call.message;
}

/** Normalises Exotel's StatusCallback payload (field names vary by event) into our enum. */
function mapExotelStatus(raw: string): CallStatus | null {
  const s = raw.toLowerCase();
  if (s.includes("progress")) return "CONNECTED";
  if (s.includes("complet")) return "COMPLETED";
  if (s.includes("fail") || s.includes("busy") || s.includes("no-answer") || s.includes("cancel")) {
    return "FAILED";
  }
  return null; // "queued" / "ringing" — no state change needed, already CALLING
}

/** Exotel's StatusCallback webhook — updates the Call row as the call progresses. */
export async function handleCallStatusWebhook(callId: string, fields: Record<string, string>): Promise<void> {
  const rawStatus = fields.Status ?? fields.CallStatus ?? fields.DialCallStatus;
  if (!rawStatus) return;
  const status = mapExotelStatus(rawStatus);
  if (!status) return;

  const call = await prisma.call.findUnique({ where: { id: callId }, select: { status: true } });
  if (!call || call.status === status) return; // already recorded; avoid duplicate logs

  const error = status === "FAILED" ? (fields.Message ?? rawStatus) : null;
  await prisma.call.update({ where: { id: callId }, data: { status, error } });
  log(status === "FAILED" ? "Call Failed" : status === "COMPLETED" ? "Call Completed" : "Call Connected", {
    callId,
    exotelStatus: rawStatus,
  });
}
