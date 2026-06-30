import { z } from "zod";

// Property-scoped expense category / subcategory management. Names are trimmed and
// bounded; uniqueness (per property / per category) is enforced by the DB and
// surfaced as a friendly message in the action.
const name = z.string().trim().min(1, "Enter a name").max(60, "Keep it under 60 characters");

export const categoryCreateSchema = z.object({ name });

export const categoryRenameSchema = z.object({
  id: z.string().min(1),
  name,
});

export const categoryDeleteSchema = z.object({ id: z.string().min(1) });

export const subcategoryCreateSchema = z.object({
  categoryId: z.string().min(1, "Select a category"),
  name,
});

export const subcategoryRenameSchema = z.object({
  id: z.string().min(1),
  name,
});

export const subcategoryDeleteSchema = z.object({ id: z.string().min(1) });

export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
export type SubcategoryCreateInput = z.infer<typeof subcategoryCreateSchema>;
