import "server-only";

import { auth } from "@/auth";
import { actionError, actionOk } from "@/lib/action-result";
import { prisma } from "@/lib/prisma";
import { getSelectedPropertyId } from "@/lib/property";

/** Validate the acting account and its property before recording any changes. */
export async function getActionContext() {
  const session = await auth();
  if (!session?.user) return actionError("Not authenticated");

  // JWT sessions survive database resets/switches. Require the original user ID:
  // a recreated account with the same email must sign in again.
  const user = session.user.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, role: true, isActive: true, propertyId: true },
      })
    : null;
  if (!user || !user.isActive) {
    return actionError("Your session is out of date. Please sign out and sign in again.");
  }

  const propertyId = await getSelectedPropertyId();
  if (!propertyId) return actionError("No active property selected");
  if (user.role !== "ADMIN" && user.propertyId !== propertyId) {
    return actionError("You do not have access to this property");
  }

  const property = await prisma.property.findFirst({
    where: { id: propertyId, isActive: true },
  });
  if (!property) return actionError("No active property selected");

  return actionOk({ propertyId: property.id, userId: user.id, property });
}
