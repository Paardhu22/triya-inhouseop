import "server-only";

import { auth } from "@/auth";
import {
  createCall,
  getCallMessage,
  getCallStatus,
  handleCallStatusWebhook,
} from "@/controllers/call.controller";
import { getActiveProperty } from "@/lib/property";

/** POST /api/calls — body: { tenantId }. Requires an authenticated session + active property. */
export async function createCallHandler(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const property = await getActiveProperty();
  if (!property) return Response.json({ error: "No active property selected" }, { status: 400 });

  const body = await request.json().catch(() => null);
  const tenantId = typeof body?.tenantId === "string" ? body.tenantId : null;
  if (!tenantId) return Response.json({ error: "tenantId is required" }, { status: 400 });

  const result = await createCall(tenantId, property.id);
  if (!result.ok) return Response.json({ error: result.error }, { status: 422 });
  return Response.json(result.data);
}

/** GET /api/calls/[id] — status poll for the AI Call button. */
export async function getCallStatusHandler(id: string): Promise<Response> {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const property = await getActiveProperty();
  if (!property) return Response.json({ error: "No active property selected" }, { status: 400 });

  const result = await getCallStatus(id, property.id);
  if (!result.ok) return Response.json({ error: result.error }, { status: 404 });
  return Response.json(result.data);
}

/**
 * GET/HEAD /api/calls/exoml — fetched by the Greeting applet inside the Exotel Flow
 * (see EXOTEL_FLOW_URL), not by Exotel's API directly. No session — Exotel can't hold
 * one. Must respond with plain text and nothing else (Exotel's documented contract
 * for "dynamic greeting from URL"); a HEAD request must return the same headers.
 */
export async function getCallMessageHandler(request: Request): Promise<Response> {
  // HEAD is Exotel's own health-check probe, not a real call — skip the DB lookup
  // (and its CALLING -> CONNECTED side effect) and just confirm the headers.
  if (request.method === "HEAD") {
    return new Response(null, { headers: { "Content-Type": "text/plain" } });
  }
  const { searchParams } = new URL(request.url);
  const text = await getCallMessage({
    customField: searchParams.get("CustomField"),
    callSid: searchParams.get("CallSid"),
  });
  return new Response(text, { headers: { "Content-Type": "text/plain" } });
}

/** POST /api/calls/[id]/status — Exotel's StatusCallback webhook; no session. */
export async function postCallStatusWebhookHandler(request: Request, id: string): Promise<Response> {
  const form = await request.formData().catch(() => null);
  const fields: Record<string, string> = {};
  if (form) {
    for (const [key, value] of form.entries()) fields[key] = String(value);
  }
  await handleCallStatusWebhook(id, fields);
  return Response.json({ ok: true });
}
