"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { FileText, Search, Trash2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteExpense } from "@/lib/actions/expenses";
import { formatINR } from "@/lib/money";
import type { ExpenseListItem } from "@/lib/queries/expenses";
import { EXPENSE_CATEGORY_LABEL } from "@/lib/status";
import { EXPENSE_CATEGORY_VALUES } from "@/lib/validations/expense";

export function ExpensesClient({ expenses }: { expenses: ExpenseListItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>("ALL");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return expenses.filter((e) => {
      if (category !== "ALL" && e.category !== category) return false;
      if (query) {
        const haystack = `${e.vendor ?? ""} ${e.notes ?? ""} ${EXPENSE_CATEGORY_LABEL[e.category]}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [expenses, q, category]);

  const total = filtered.reduce((sum, e) => sum + e.amount, 0);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search vendor or notes"
            className="pl-8"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All categories</SelectItem>
            {EXPENSE_CATEGORY_VALUES.map((c) => (
              <SelectItem key={c} value={c}>
                {EXPENSE_CATEGORY_LABEL[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto text-sm text-muted-foreground">
          Total:{" "}
          <span className="font-medium text-foreground tabular-nums">{formatINR(total)}</span>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Date</TableHead>
              <TableHead className="w-40">Category</TableHead>
              <TableHead>Vendor</TableHead>
              <TableHead className="w-32 text-right">Amount</TableHead>
              <TableHead className="w-20 text-center">Receipt</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                  No expenses match your filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(e.date, "dd MMM yyyy")}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal">
                      {EXPENSE_CATEGORY_LABEL[e.category]}
                    </Badge>
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
                        <Button variant="ghost" size="icon" disabled={pending} aria-label="Delete expense">
                          <Trash2 className="size-4 text-muted-foreground" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This permanently removes the {EXPENSE_CATEGORY_LABEL[e.category]}{" "}
                            expense of {formatINR(e.amount)}.
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
