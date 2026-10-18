import "server-only";
import { prisma } from "@/lib/prisma";

export async function propertyOwnsFile(propertyId: string, key: string) {
  const [invoice, tenant, document, expense, property] = await Promise.all([
    prisma.invoice.findFirst({ where: { propertyId, storageKey: key }, select: { id: true } }),
    prisma.tenant.findFirst({ where: { propertyId, photoUrl: key }, select: { id: true } }),
    prisma.document.findFirst({ where: { storageKey: key, tenant: { propertyId } }, select: { id: true } }),
    prisma.expense.findFirst({ where: { propertyId, receiptKey: key }, select: { id: true } }),
    prisma.property.findFirst({ where: { id: propertyId, logoKey: key, isActive: true }, select: { id: true } }),
  ]);
  return Boolean(invoice || tenant || document || expense || property);
}
