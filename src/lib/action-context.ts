import "server-only";

import { auth } from "@/auth";
import { actionError, actionOk } from "@/lib/action-result";
import { getActiveProperty } from "@/lib/property";
import { enforceRateLimit } from "@/lib/security/rate-limit";

/** Validate the acting account and its property before recording any changes. */
export async function getActionContext() {
  const session = await auth();
  if (!session?.user) return actionError("Not authenticated");

  // auth() validates the live account; getActiveProperty() validates ownership.
  const property = await getActiveProperty();
  if (!property) return actionError("No active property selected");
  if (await enforceRateLimit("write-user", session.user.id, 60)) {
    return actionError("Too many changes. Please try again shortly.");
  }
  return actionOk({ propertyId: property.id, userId: session.user.id, property });
}
