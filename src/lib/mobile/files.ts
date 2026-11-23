import "server-only";
import { prisma } from "@/lib/prisma";
import { canReviewRegistrations } from "@/lib/registrations/permissions";

/**
 * True when `key` belongs to `propertyId`. A KYC image still held by a registration request
 * is only visible to ADMIN/MANAGER (pass `role`; omitted = denied). Once a request is
 * approved the same key belongs to the tenant and follows the normal tenant-file rules.
 */
export async function propertyOwnsFile(propertyId: string, key: string, role?: string | null) {
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId, isActive: true,
      OR: [
        { logoKey: key },
        { invoices: { some: { storageKey: key } } },
        { tenants: { some: { OR: [{ photoUrl: key }, { documents: { some: { storageKey: key } } }] } } },
        { expenses: { some: { receiptKey: key } } },
        ...(canReviewRegistrations(role) ? [{ registrationRequests: { some: { kycKey: key } } }] : []),
      ],
    },
    select: { id: true },
  });
  return Boolean(property);
}
