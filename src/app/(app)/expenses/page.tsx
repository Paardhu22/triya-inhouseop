import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { StatCard } from "@/components/dashboard/stat-card";
import { CategoryManager } from "@/components/expenses/category-manager";
import { ExpenseChart } from "@/components/expenses/expense-chart";
import { ExpenseDistribution } from "@/components/expenses/expense-distribution";
import { ExpenseFormDialog } from "@/components/expenses/expense-form-dialog";
import { ExpensesClient } from "@/components/expenses/expenses-client";
import { PageHeader } from "@/components/shell/page-header";
import { formatINR, formatINRCompact } from "@/lib/money";
import { getCategoriesWithStats } from "@/lib/queries/expense-categories";
import { getExpenseAnalytics, getExpenses } from "@/lib/queries/expenses";
import { getSelectedPropertyId } from "@/lib/property";

export const metadata: Metadata = {
  title: "Expense Tracker",
};

export default async function ExpensesPage() {
  const propertyId = await getSelectedPropertyId();
  if (!propertyId) redirect("/select-property");

  const [session, expenses, analytics, categories] = await Promise.all([
    auth(),
    getExpenses(propertyId),
    getExpenseAnalytics(propertyId),
    getCategoriesWithStats(propertyId),
  ]);

  const role = session?.user?.role;
  const canManage = role === "ADMIN" || role === "MANAGER";

  return (
    <div className="space-y-10">
      <PageHeader
        title="Expense Tracker"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canManage ? <CategoryManager categories={categories} /> : null}
            <ExpenseFormDialog categories={categories} />
          </div>
        }
      />

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-x-6 border-y border-border lg:grid-cols-5">
        <StatCard
          label="This month"
          value={formatINRCompact(analytics.thisMonthTotal)}
          hint={`${analytics.thisMonthCount} ${analytics.thisMonthCount === 1 ? "entry" : "entries"}`}
        />
        <StatCard label="This year" value={formatINRCompact(analytics.thisYearTotal)} hint="Jan to date" />
        <StatCard
          label="Avg / month"
          value={formatINRCompact(analytics.avgMonthly)}
          hint="trailing 12 months"
        />
        <StatCard
          label="Top category"
          value={analytics.topCategory?.name ?? "—"}
          hint={analytics.topCategory ? formatINR(analytics.topCategory.total) : "No spend yet"}
        />
        <StatCard
          label="Top vendor"
          value={analytics.topVendor?.name ?? "—"}
          hint={analytics.topVendor ? formatINR(analytics.topVendor.total) : "No spend yet"}
        />
      </div>

      {/* Trend + distribution */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="space-y-5 border-t border-border pt-6">
          <h2 className="text-sm font-semibold tracking-[-0.015em] text-foreground">
            Monthly trend
          </h2>
          <ExpenseChart series={analytics.series} />
        </section>
        <section className="border-t border-border pt-6">
          <ExpenseDistribution
            categories={analytics.categoryDistribution}
            subcategories={analytics.subcategoryDistribution}
          />
        </section>
      </div>

      <ExpensesClient expenses={expenses} categories={categories} />
    </div>
  );
}
