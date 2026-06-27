import { z } from "zod";

// Editable invoice fields. Money is entered in rupees at the form boundary and
// converted to paise in the action (same convention as src/lib/validations/tenant.ts).
// Rent and maintenance are NOT editable here — they come from the tenancy.

const rupees = z.coerce.number().min(0, "Enter a valid amount").max(10_000_000);

// Server schema: the dialog posts a plain object. Dates stay strings and are
// converted in the action.
export const sendInvoiceSchema = z.object({
  tenancyId: z.string().min(1),
  billingMonth: z.string().regex(/^\d{4}-\d{2}$/, "Select a billing month"),
  dueDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid due date")
    .optional()
    .or(z.literal("")),
  previousDue: rupees,
  extraCharges: rupees,
  extraChargesLabel: z.string().trim().max(80).optional().or(z.literal("")),
  discount: rupees,
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

// Client form schema (plain strings, friendly messages for React Hook Form).
export const invoiceFormSchema = z
  .object({
    billingMonth: z.string().min(1, "Select a billing month"),
    dueDate: z.string(),
    previousDue: z.string(),
    extraChargesLabel: z.string().max(80),
    extraCharges: z.string(),
    discount: z.string(),
    notes: z.string().max(500, "Keep notes under 500 characters"),
  })
  .superRefine((val, ctx) => {
    for (const key of ["previousDue", "extraCharges", "discount"] as const) {
      const v = val[key].trim();
      if (v && (Number.isNaN(Number(v)) || Number(v) < 0)) {
        ctx.addIssue({ code: "custom", path: [key], message: "Enter a valid amount" });
      }
    }
  });

export type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;

// What the preview dialog posts to sendInvoice: the form values plus the tenancy.
export type SendInvoiceInput = InvoiceFormValues & { tenancyId: string };
