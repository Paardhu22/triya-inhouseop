import { format } from "date-fns";

import { auth } from "@/auth";
import {
  applyExpenseFilters,
  type ExpenseFilters,
  filtersFromSearchParams,
} from "@/lib/expense-filters";
import { generateExpenseReportPdf } from "@/lib/expense-report";
import { prisma } from "@/lib/prisma";
import { getActiveProperty } from "@/lib/property";
import { getExpenses } from "@/lib/queries/expenses";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const SORT_LABEL: Record<ExpenseFilters["sort"], string> = {
  latest: "Latest first",
  oldest: "Oldest first",
  highest: "Highest amount",
  lowest: "Lowest amount",
};

function describeFilters(
  f: ExpenseFilters,
  catName: Map<string, string>,
  subName: Map<string, string>,
): string[] {
  const out: string[] = [];
  if (f.search) out.push(`Search: "${f.search}"`);
  if (f.categoryId) out.push(`Category: ${catName.get(f.categoryId) ?? f.categoryId}`);
  if (f.subcategoryId) out.push(`Subcategory: ${subName.get(f.subcategoryId) ?? f.subcategoryId}`);
  if (f.vendor) out.push(`Vendor: ${f.vendor}`);
  if (f.year) out.push(`Year: ${f.year}`);
  if (f.month) out.push(`Month: ${MONTHS[Number(f.month) - 1] ?? f.month}`);
  if (f.dateFrom || f.dateTo) out.push(`Date: ${f.dateFrom || "…"} → ${f.dateTo || "…"}`);
  if (f.amountMin || f.amountMax) out.push(`Amount: ₹${f.amountMin || "0"} – ₹${f.amountMax || "∞"}`);
  if (f.hasReceipt !== "any") {
    out.push(`Receipt: ${f.hasReceipt === "yes" ? "with receipt" : "without receipt"}`);
  }
  out.push(`Sorted: ${SORT_LABEL[f.sort]}`);
  return out;
}

// GET /api/expenses/export?<filters> — streams a filter-aware PDF report.
// /api is excluded from the proxy matcher (src/proxy.ts), so this handler must
// authenticate itself, exactly like src/app/api/files/[...key]/route.ts.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const property = await getActiveProperty();
  if (!property) return new Response("No active property selected", { status: 400 });

  const { searchParams } = new URL(req.url);
  const filters = filtersFromSearchParams(searchParams);

  const [all, cats, subs] = await Promise.all([
    getExpenses(property.id),
    prisma.expenseCategory.findMany({ where: { propertyId: property.id }, select: { id: true, name: true } }),
    prisma.expenseSubcategory.findMany({ where: { propertyId: property.id }, select: { id: true, name: true } }),
  ]);

  const rows = applyExpenseFilters(all, filters);

  const breakdown = new Map<string, number>();
  for (const r of rows) breakdown.set(r.categoryName, (breakdown.get(r.categoryName) ?? 0) + r.amount);
  const categoryBreakdown = [...breakdown.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);

  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const subName = new Map(subs.map((s) => [s.id, s.name]));

  const pdf = await generateExpenseReportPdf({
    propertyName: property.name,
    propertyAddress: property.address,
    generatedAt: new Date(),
    appliedFilters: describeFilters(filters, catName, subName),
    rows: rows.map((r) => ({
      date: r.date,
      category: r.categoryName,
      subcategory: r.subcategoryName,
      vendor: r.vendor,
      amount: r.amount,
    })),
    total: rows.reduce((sum, r) => sum + r.amount, 0),
    categoryBreakdown,
  });

  const bytes = new Uint8Array(pdf.byteLength);
  bytes.set(pdf);
  const filename = `expense-report-${format(new Date(), "yyyy-MM-dd")}.pdf`;

  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
