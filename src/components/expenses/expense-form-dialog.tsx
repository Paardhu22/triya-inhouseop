"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createExpense } from "@/lib/actions/expenses";
import type { CategoryWithStats } from "@/lib/queries/expense-categories";
import { expenseFormSchema, type ExpenseFormValues } from "@/lib/validations/expense";

export function ExpenseFormDialog({ categories }: { categories: CategoryWithStats[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [receipt, setReceipt] = useState<File | null>(null);
  const [receiptInputKey, setReceiptInputKey] = useState(0);

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      categoryId: "",
      subcategoryId: "",
      amount: "",
      date: new Date().toISOString().slice(0, 10),
      vendor: "",
      notes: "",
    },
  });

  const selectedCategoryId = useWatch({ control: form.control, name: "categoryId" });
  const subcategories = useMemo(
    () => categories.find((c) => c.id === selectedCategoryId)?.subcategories ?? [],
    [categories, selectedCategoryId],
  );
  const noCategories = categories.length === 0;

  function clearReceipt() {
    setReceipt(null);
    setReceiptInputKey((key) => key + 1);
  }

  function onSubmit(values: ExpenseFormValues) {
    // Subcategory is required only when the chosen category has any.
    if (subcategories.length > 0 && !values.subcategoryId) {
      form.setError("subcategoryId", { message: "Select a subcategory" });
      return;
    }

    const fd = new FormData();
    fd.append("categoryId", values.categoryId);
    fd.append("subcategoryId", subcategories.length > 0 ? values.subcategoryId : "");
    fd.append("amount", values.amount);
    fd.append("date", values.date);
    fd.append("vendor", values.vendor);
    fd.append("notes", values.notes);
    if (receipt) fd.append("receipt", receipt);

    startTransition(async () => {
      const res = await createExpense(fd);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Expense added");
      setOpen(false);
      form.reset();
      clearReceipt();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          Add expense
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add expense</DialogTitle>
          <DialogDescription>Record a new expense for this property.</DialogDescription>
        </DialogHeader>

        {noCategories ? (
          <div className="rounded-lg border border-dashed bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
            No categories yet. Create one from{" "}
            <span className="font-medium text-foreground">Manage categories</span> before logging an
            expense.
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="categoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(v) => {
                          field.onChange(v);
                          form.setValue("subcategoryId", "");
                          form.clearErrors("subcategoryId");
                        }}
                        disabled={pending}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {categories.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="subcategoryId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Subcategory
                        {selectedCategoryId && subcategories.length === 0 ? (
                          <span className="ml-1 font-normal text-muted-foreground">(none)</span>
                        ) : null}
                      </FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={pending || subcategories.length === 0}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue
                              placeholder={
                                !selectedCategoryId
                                  ? "Pick category first"
                                  : subcategories.length === 0
                                    ? "—"
                                    : "Select subcategory"
                              }
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {subcategories.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount (₹)</FormLabel>
                      <FormControl>
                        <Input type="number" min={0} step="0.01" placeholder="0" disabled={pending} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date</FormLabel>
                      <FormControl>
                        <Input type="date" disabled={pending} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="vendor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendor</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. TSSPDCL (optional)" disabled={pending} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea rows={2} placeholder="Optional" disabled={pending} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <Label>Receipt (optional)</Label>
                {receipt ? (
                  <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                    <span className="truncate">{receipt.name}</span>
                    <button type="button" onClick={clearReceipt} aria-label="Remove receipt">
                      <X className="size-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground transition hover:bg-muted/50">
                    <Upload className="size-4" />
                    Upload receipt
                    <input
                      key={receiptInputKey}
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
                    />
                  </label>
                )}
              </div>

              <DialogFooter>
                <Button type="submit" disabled={pending}>
                  {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Add expense
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
