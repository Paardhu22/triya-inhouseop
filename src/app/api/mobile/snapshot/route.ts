import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { mobileContext, getMobileSession, mobileUserSelect } from "@/lib/mobile/session";

/** One consistent property-scoped snapshot; the app derives its existing views from these real rows. */
export async function GET() {
  const ctx = await mobileContext();
  if (!ctx) return Response.json({ error: "Sign in and select an accessible property" }, { status: (await getMobileSession()) ? 403 : 401 });
  const where = { propertyId: ctx.property.id };
  const rows = await prisma.$transaction(async tx => {
    const [users, blocks, floors, rooms, beds, tenants, tenancyRows, payments, invoices,
      complaints, expenses, expenseCategories, expenseSubcategories, documents] = await Promise.all([
      tx.user.findMany({ where: { isActive: true, OR: [{ role: "ADMIN" }, where] }, select: mobileUserSelect }),
      tx.block.findMany({ where }), tx.floor.findMany({ where }), tx.room.findMany({ where }),
      tx.bed.findMany({ where }), tx.tenant.findMany({ where }), tx.tenancy.findMany({ where }),
      tx.payment.findMany({ where, include: { recordedBy: { select: { name: true } } } }),
      tx.invoice.findMany({ where }), tx.complaint.findMany({ where }),
      tx.expense.findMany({ where, include: { createdBy: { select: { name: true } } } }),
      tx.expenseCategory.findMany({ where }), tx.expenseSubcategory.findMany({ where }),
      tx.document.findMany({ where: { tenant: where } }),
    ]);
    return { users, blocks, floors, rooms, beds, tenants, tenancies: tenancyRows.map(t => ({ ...t, expectedLeavingDate: t.expectedLeavingDate ?? (t.noticeGivenDate ? addDays(t.noticeGivenDate, 15) : null) })), invoices, complaints,
      expenseCategories, expenseSubcategories, documents, properties: [ctx.property],
      payments: payments.map(({ recordedBy, ...p }) => ({ ...p, recordedByName: recordedBy?.name ?? null })),
      expenses: expenses.map(({ createdBy, ...e }) => ({ ...e, createdByName: createdBy?.name ?? null })),
    };
  }, { isolationLevel: "RepeatableRead" });
  return Response.json(rows, { headers: { "Cache-Control": "no-store" } });
}
