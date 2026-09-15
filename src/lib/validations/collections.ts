import { z } from "zod";

// Recording a rent collection. The dialog posts a plain object (not FormData), so a
// single schema serves both the client form and the server action. Money is in RUPEES
// at this boundary and converted to paise in the action.

const rupees = z
  .number({ error: "Enter a valid amount" })
  .min(0, "Enter a valid amount")
  .max(10_000_000, "Amount is too large");

export const collectRentSchema = z
  .object({
    tenancyId: z.string().trim().min(1),
    /** Billing month this collection settles, as YYYY-MM. */
    forMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Select a billing month"),
    amount: rupees.refine((v) => v > 0, "Enter the amount collected"),
    method: z.enum(["CASH", "ONLINE", "SPLIT"]),
    cashAmount: rupees.optional(),
    onlineAmount: rupees.optional(),
    /**
     * When the money changed hands, as a full ISO timestamp. The browser converts its
     * local `datetime-local` value first — a bare "YYYY-MM-DDTHH:mm" would be read in
     * the SERVER's timezone and shift the receipt by hours.
     */
    collectedAt: z.iso.datetime({ offset: true, error: "Select when the payment was collected" }),
    notes: z.string().trim().max(300).optional(),
    /** Issue the invoice for this collection and send it to the tenant on WhatsApp. */
    sendInvoice: z.boolean().default(true),
  })
  .superRefine((val, ctx) => {
    if (val.method === "SPLIT") {
      const cash = val.cashAmount ?? 0;
      const online = val.onlineAmount ?? 0;
      // Guard the invariant the reports rely on: the split must reconstruct the total.
      if (Math.round((cash + online) * 100) !== Math.round(val.amount * 100)) {
        ctx.addIssue({
          code: "custom",
          path: ["cashAmount"],
          message: `Cash + online must add up to ₹${val.amount.toLocaleString("en-IN")}`,
        });
      }
    }
    // A collection cannot be recorded in the future. One day of slack absorbs clock
    // skew between the staff device and the server.
    const at = new Date(val.collectedAt);
    if (!Number.isNaN(at.getTime()) && at.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      ctx.addIssue({
        code: "custom",
        path: ["collectedAt"],
        message: "The collection date cannot be in the future",
      });
    }
  });

export type CollectRentInput = z.input<typeof collectRentSchema>;
