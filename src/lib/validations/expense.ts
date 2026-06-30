import { z } from "zod";

// Server schema (coerce strings from FormData). Categories/subcategories are now
// dynamic, property-scoped rows, so we validate ids here and check ownership +
// the "subcategory required when the category has any" rule in the action.
export const expenseServerSchema = z.object({
  categoryId: z.string().min(1, "Select a category"),
  subcategoryId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
  amount: z.coerce.number().positive("Enter a valid amount").max(100_000_000),
  date: z.coerce.date(),
  vendor: z.string().trim().max(160),
  notes: z.string().trim().max(1000),
});

// Client form schema (plain strings for React Hook Form).
export const expenseFormSchema = z.object({
  categoryId: z.string().min(1, "Select a category"),
  subcategoryId: z.string(),
  amount: z
    .string()
    .min(1, "Enter an amount")
    .refine((v) => Number(v) > 0, "Enter a valid amount"),
  date: z.string().min(1, "Select a date"),
  vendor: z.string().max(160),
  notes: z.string().max(1000),
});

export type ExpenseFormValues = z.infer<typeof expenseFormSchema>;
