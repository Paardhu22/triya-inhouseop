import "server-only";

import { prisma } from "@/lib/prisma";

// Categories + their subcategories with per-row spend totals. One query serves
// both the management Sheet (needs totals/counts) and the Add Expense dialog
// (needs the id/name tree) — the dialog simply ignores the totals.
export async function getCategoriesWithStats(propertyId: string) {
  const [categories, byCategory, bySubcategory] = await Promise.all([
    prisma.expenseCategory.findMany({
      where: { propertyId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        subcategories: { orderBy: { name: "asc" }, select: { id: true, name: true } },
      },
    }),
    prisma.expense.groupBy({
      by: ["categoryId"],
      where: { propertyId },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.expense.groupBy({
      by: ["subcategoryId"],
      where: { propertyId, subcategoryId: { not: null } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  const catTotals = new Map(
    byCategory.map((g) => [g.categoryId, { total: g._sum.amount ?? 0, count: g._count._all }]),
  );
  const subTotals = new Map(
    bySubcategory.map((g) => [g.subcategoryId as string, { total: g._sum.amount ?? 0, count: g._count._all }]),
  );

  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    total: catTotals.get(c.id)?.total ?? 0,
    count: catTotals.get(c.id)?.count ?? 0,
    subcategories: c.subcategories.map((s) => ({
      id: s.id,
      name: s.name,
      total: subTotals.get(s.id)?.total ?? 0,
      count: subTotals.get(s.id)?.count ?? 0,
    })),
  }));
}

export type CategoryWithStats = Awaited<ReturnType<typeof getCategoriesWithStats>>[number];
export type SubcategoryWithStats = CategoryWithStats["subcategories"][number];
