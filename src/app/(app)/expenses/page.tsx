import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Layers, Receipt, TrendingDown } from "lucide-react";

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
    <div className="space-y-5">
      <PageHeader
        title="Expense Tracker"
        description="Log expenses and monitor monthly spending."
        actions={<ExpenseFormDialog />}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="This month"
          value={formatINR(stats.thisMonthTotal)}
          hint={`${stats.thisMonthCount} ${stats.thisMonthCount === 1 ? "entry" : "entries"}`}
          icon={TrendingDown}
        />
        <StatCard
          label="Top category"
          value={topCategory ? EXPENSE_CATEGORY_LABEL[topCategory.category] : "—"}
          hint={topCategory ? formatINR(topCategory.total) : "No spend yet"}
          icon={Layers}
        />
        <StatCard
          label="Total entries"
          value={expenses.length}
          hint="all time"
          icon={Receipt}
        />
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-medium">Monthly expenses</h3>
        <ExpenseChart series={stats.series} />
      </div>

      <ExpensesClient expenses={expenses} />
    </div>
  );
}
