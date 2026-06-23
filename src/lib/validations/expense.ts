import { z } from "zod";

export const EXPENSE_CATEGORY_VALUES = [
  "ELECTRICITY",
  "WATER",
  "MAINTENANCE",
  "SALARY",
  "INTERNET",
  "CLEANING",
  "MISCELLANEOUS",
] as const;

// Server schema (coerce strings from FormData).
export const expenseServerSchema = z.object({
  category: z.enum(EXPENSE_CATEGORY_VALUES),
  amount: z.coerce.number().positive("Enter a valid amount").max(100_000_000),
  date: z.coerce.date(),
  vendor: z.string().trim().max(160),
  notes: z.string().trim().max(1000),
});

// Client form schema (plain strings for React Hook Form).
export const expenseFormSchema = z.object({
  category: z.enum(EXPENSE_CATEGORY_VALUES),
  amount: z
    .string()
    .min(1, "Enter an amount")
    .refine((v) => Number(v) > 0, "Enter a valid amount"),
  date: z.string().min(1, "Select a date"),
  vendor: z.string().max(160),
  notes: z.string().max(1000),
});

export type ExpenseFormValues = z.infer<typeof expenseFormSchema>;
