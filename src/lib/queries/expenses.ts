import "server-only";

import { format, startOfMonth, startOfYear, subMonths } from "date-fns";

import { prisma } from "@/lib/prisma";

// Flat row shape: category/subcategory names are flattened so the same item type
// powers the table, the client-side filters (src/lib/expense-filters.ts) and the
// PDF export without re-shaping.
export async function getExpenses(propertyId: string) {
  const rows = await prisma.expense.findMany({
    where: { propertyId },
    orderBy: { date: "desc" },
    select: {
      id: true,
      amount: true,
      date: true,
      vendor: true,
      notes: true,
      receiptKey: true,
      categoryId: true,
      subcategoryId: true,
      category: { select: { name: true } },
      subcategory: { select: { name: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    amount: r.amount,
    date: r.date,
    vendor: r.vendor,
    notes: r.notes,
    receiptKey: r.receiptKey,
    categoryId: r.categoryId,
    categoryName: r.category.name,
    subcategoryId: r.subcategoryId,
    subcategoryName: r.subcategory?.name ?? null,
  }));
}

// Everything the analytics section needs, computed over a single trailing-12-month
// read (which also covers "this year", since the year start is at most 11 months
// behind the current month).
export async function getExpenseAnalytics(propertyId: string) {
  const now = new Date();
  const windowStart = startOfMonth(subMonths(now, 11));
  const yearStart = startOfYear(now);
  const thisMonthKey = format(now, "yyyy-MM");

  const rows = await prisma.expense.findMany({
    where: { propertyId, date: { gte: windowStart } },
    select: {
      amount: true,
      date: true,
      vendor: true,
      category: { select: { name: true } },
      subcategory: { select: { name: true } },
    },
  });

  const series = Array.from({ length: 12 }, (_, i) => {
    const m = subMonths(now, 11 - i);
    return { key: format(m, "yyyy-MM"), label: format(m, "MMM"), total: 0 };
  });
  const byKey = new Map(series.map((s) => [s.key, s]));

  const catTotals = new Map<string, number>();
  const subTotals = new Map<string, number>();
  const vendorTotals = new Map<string, number>();

  let thisMonthTotal = 0;
  let thisMonthCount = 0;
  let thisYearTotal = 0;

  for (const r of rows) {
    const key = format(r.date, "yyyy-MM");
    const bucket = byKey.get(key);
    if (bucket) bucket.total += r.amount;

    if (key === thisMonthKey) {
      thisMonthTotal += r.amount;
      thisMonthCount += 1;
    }

    if (r.date >= yearStart) {
      thisYearTotal += r.amount;
      catTotals.set(r.category.name, (catTotals.get(r.category.name) ?? 0) + r.amount);
      if (r.subcategory) {
        const label = `${r.category.name} · ${r.subcategory.name}`;
        subTotals.set(label, (subTotals.get(label) ?? 0) + r.amount);
      }
      if (r.vendor) vendorTotals.set(r.vendor, (vendorTotals.get(r.vendor) ?? 0) + r.amount);
    }
  }

  const rank = (m: Map<string, number>) =>
    [...m.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);

  const categoryDistribution = rank(catTotals);
  const subcategoryDistribution = rank(subTotals);
  const vendorRanking = rank(vendorTotals);
  const windowTotal = series.reduce((sum, m) => sum + m.total, 0);

  return {
    series: series.map(({ label, total }) => ({ label, total })),
    thisMonthTotal,
    thisMonthCount,
    thisYearTotal,
    avgMonthly: Math.round(windowTotal / 12),
    categoryDistribution,
    subcategoryDistribution,
    topCategory: categoryDistribution[0] ?? null,
    topVendor: vendorRanking[0] ?? null,
  };
}

export type ExpenseListItem = Awaited<ReturnType<typeof getExpenses>>[number];
export type ExpenseAnalytics = Awaited<ReturnType<typeof getExpenseAnalytics>>;
