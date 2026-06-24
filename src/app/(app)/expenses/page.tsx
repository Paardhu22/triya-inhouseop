import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ExpenseChart } from "@/components/expenses/expense-chart";
import { ExpenseFormDialog } from "@/components/expenses/expense-form-dialog";
import { ExpensesClient } from "@/components/expenses/expenses-client";
import { StatCard } from "@/components/dashboard/stat-card";
import { PageHeader } from "@/components/shell/page-header";
import { formatINR } from "@/lib/money";
import { getExpenses, getExpenseStats } from "@/lib/queries/expenses";
import { getSelectedPropertyId } from "@/lib/property";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/status";

export const metadata: Metadata = {
  title: "Expense Tracker",
};

export default async function ExpensesPage() {
  const propertyId = await getSelectedPropertyId();
  if (!propertyId) redirect("/select-property");

  const [expenses, stats] = await Promise.all([
    getExpenses(propertyId),
    getExpenseStats(propertyId),
  ]);

  const topCategory = stats.byCategory[0];

  return (
    <div className="space-y-10">
      <PageHeader
        title="Expense Tracker"
        description="Log expenses and monitor monthly spending."
        actions={<ExpenseFormDialog />}
      />

      <div className="grid grid-cols-1 gap-x-12 gap-y-10 sm:grid-cols-3">
        <StatCard
          label="This month"
          value={formatINR(stats.thisMonthTotal)}
          hint={`${stats.thisMonthCount} ${stats.thisMonthCount === 1 ? "entry" : "entries"}`}
        />
        <StatCard
          label="Top category"
          value={topCategory ? EXPENSE_CATEGORY_LABEL[topCategory.category] : "—"}
          hint={topCategory ? formatINR(topCategory.total) : "No spend yet"}
        />
        <StatCard label="Total entries" value={expenses.length} hint="all time" />
      </div>

      <section className="space-y-4">
        <h2 className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          Monthly expenses
        </h2>
        <div className="rounded-xl border border-border bg-card p-6">
          <ExpenseChart series={stats.series} />
        </div>
      </section>

      <ExpensesClient expenses={expenses} />
    </div>
  );
}
