import "server-only";
import { prisma } from "@/lib/prisma";

export async function propertyOwnsFile(propertyId: string, key: string) {
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId, isActive: true,
      OR: [
        { logoKey: key },
        { invoices: { some: { storageKey: key } } },
        { tenants: { some: { OR: [{ photoUrl: key }, { documents: { some: { storageKey: key } } }] } } },
        { expenses: { some: { receiptKey: key } } },
      ],
    },
    select: { id: true },
  });
  return Boolean(property);
}
