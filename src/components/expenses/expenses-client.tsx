"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Download, FileText, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteExpense } from "@/lib/actions/expenses";
import {
  applyExpenseFilters,
  DEFAULT_FILTERS,
  type ExpenseFilters,
  filtersToSearchParams,
} from "@/lib/expense-filters";
import { formatINR } from "@/lib/money";
import type { CategoryWithStats } from "@/lib/queries/expense-categories";
import type { ExpenseListItem } from "@/lib/queries/expenses";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const ALL = "all"; // Radix Select can't use an empty-string value.

export function ExpensesClient({
  expenses,
  categories,
}: {
  expenses: ExpenseListItem[];
  categories: CategoryWithStats[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [filters, setFilters] = useState<ExpenseFilters>(DEFAULT_FILTERS);

  function update(patch: Partial<ExpenseFilters>) {
    setFilters((f) => ({ ...f, ...patch }));
  }

  const subOptions = useMemo(() => {
    if (filters.categoryId) {
      return categories.find((c) => c.id === filters.categoryId)?.subcategories ?? [];
    }
    return categories.flatMap((c) => c.subcategories);
  }, [categories, filters.categoryId]);

  const years = useMemo(() => {
    const set = new Set(expenses.map((e) => new Date(e.date).getFullYear()));
    set.add(new Date().getFullYear());
    return [...set].sort((a, b) => b - a);
  }, [expenses]);

  const filtered = useMemo(() => applyExpenseFilters(expenses, filters), [expenses, filters]);
  const total = filtered.reduce((sum, e) => sum + e.amount, 0);

  const advancedCount = [
    filters.month,
    filters.year,
    filters.dateFrom,
    filters.dateTo,
    filters.vendor,
    filters.amountMin,
    filters.amountMax,
    filters.hasReceipt !== "any" ? "x" : "",
  ].filter(Boolean).length;

  const anyActive =
    advancedCount > 0 || filters.search !== "" || filters.categoryId !== "" || filters.subcategoryId !== "";

  function onDelete(id: string) {
    startTransition(async () => {
      const res = await deleteExpense(id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Expense deleted");
      router.refresh();
    });
  }

  function exportPdf() {
    const qs = filtersToSearchParams(filters).toString();
    window.open(`/api/expenses/export${qs ? `?${qs}` : ""}`, "_blank");
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => update({ search: e.target.value })}
            placeholder="Search vendor or notes"
            className="pl-8"
          />
        </div>

        <Select
          value={filters.categoryId || ALL}
          onValueChange={(v) => update({ categoryId: v === ALL ? "" : v, subcategoryId: "" })}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.subcategoryId || ALL}
          onValueChange={(v) => update({ subcategoryId: v === ALL ? "" : v })}
          disabled={subOptions.length === 0}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Subcategory" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All subcategories</SelectItem>
            {subOptions.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.sort} onValueChange={(v) => update({ sort: v as ExpenseFilters["sort"] })}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="latest">Latest</SelectItem>
            <SelectItem value="oldest">Oldest</SelectItem>
            <SelectItem value="highest">Highest amount</SelectItem>
            <SelectItem value="lowest">Lowest amount</SelectItem>
          </SelectContent>
        </Select>

        {/* Advanced filters */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-1.5">
              <SlidersHorizontal className="size-4" />
              Filters
              {advancedCount > 0 ? (
                <Badge variant="secondary" className="ml-0.5 size-5 justify-center p-0 tabular-nums">
                  {advancedCount}
                </Badge>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Month</Label>
                <Select value={filters.month || ALL} onValueChange={(v) => update({ month: v === ALL ? "" : v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Any month</SelectItem>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={m} value={String(i + 1)}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Year</Label>
                <Select value={filters.year || ALL} onValueChange={(v) => update({ year: v === ALL ? "" : v })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Any year</SelectItem>
                    {years.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">From</Label>
                <Input type="date" value={filters.dateFrom} onChange={(e) => update({ dateFrom: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">To</Label>
                <Input type="date" value={filters.dateTo} onChange={(e) => update({ dateTo: e.target.value })} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Vendor</Label>
              <Input
                value={filters.vendor}
                onChange={(e) => update({ vendor: e.target.value })}
                placeholder="e.g. TSSPDCL"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Min ₹</Label>
                <Input
                  type="number"
                  min={0}
                  value={filters.amountMin}
                  onChange={(e) => update({ amountMin: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Max ₹</Label>
                <Input
                  type="number"
                  min={0}
                  value={filters.amountMax}
                  onChange={(e) => update({ amountMax: e.target.value })}
                  placeholder="Any"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <Label htmlFor="has-receipt" className="text-sm font-normal">
                Has receipt only
              </Label>
              <Switch
                id="has-receipt"
                checked={filters.hasReceipt === "yes"}
                onCheckedChange={(c) => update({ hasReceipt: c ? "yes" : "any" })}
              />
            </div>
          </PopoverContent>
        </Popover>

        <div className="ml-auto flex items-center gap-2">
          {anyActive ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setFilters(DEFAULT_FILTERS)}
            >
              <X className="size-4" />
              Clear
            </Button>
          ) : null}
          <Button variant="outline" onClick={exportPdf} disabled={filtered.length === 0}>
            <Download className="size-4" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* Summary line */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {filtered.length} {filtered.length === 1 ? "expense" : "expenses"}
        </span>
        <span>
          Total:{" "}
          <span className="font-medium text-foreground tabular-nums">{formatINR(total)}</span>
        </span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Date</TableHead>
              <TableHead className="w-36">Category</TableHead>
              <TableHead className="w-36">Subcategory</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead className="w-32 text-right">Amount</TableHead>
              <TableHead className="w-16 text-center">Receipt</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center">
                  <p className="text-sm font-medium">No expenses found</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {anyActive ? "Try adjusting or clearing your filters." : "Add your first expense to get started."}
                  </p>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((e) => (
                <TableRow key={e.id} className="group">
                  <TableCell className="text-sm text-muted-foreground tabular-nums">
                    {format(e.date, "dd MMM yyyy")}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal">
                      {e.categoryName}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {e.subcategoryName ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {e.vendor ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatINR(e.amount)}
                  </TableCell>
                  <TableCell className="text-center">
                    {e.receiptKey ? (
                      <a
                        href={`/api/files/${e.receiptKey}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex text-muted-foreground hover:text-foreground"
                        aria-label="View receipt"
                      >
                        <FileText className="size-4" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={pending}
                          aria-label="Delete expense"
                          className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                        >
                          <Trash2 className="size-4 text-muted-foreground" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This permanently removes the {e.categoryName} expense of {formatINR(e.amount)}.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => onDelete(e.id)}
                            className="bg-destructive text-white hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
