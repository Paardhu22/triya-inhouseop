import { z } from "zod";

// Server-side schema for saving a bed. Tenant fields are optional here and only
// required when the bed is being marked OCCUPIED (validated in the action).
// Empty FormData strings are converted to undefined before parsing.
export const saveBedSchema = z.object({
  bedId: z.string().min(1),
  occupancyStatus: z.enum(["AVAILABLE", "OCCUPIED"]),
  fullName: z.string().trim().min(2, "Tenant name is required").max(120).optional(),
  phone: z
    .string()
    .trim()
    .transform((val) => val.replace(/[\s-]/g, ""))
    .refine(
      (val) => !val || /^(?:\+91|91|0)?[6-9]\d{9}$/.test(val),
      "Enter a valid 10-digit phone number"
    )
    .optional(),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  rentAmount: z.coerce.number().int("Enter a valid amount").min(0).max(10_000_000).optional(),
  // Rupees at the form boundary; converted to paise in the action.
  maintenanceCharge: z.coerce.number().int().min(0).max(10_000_000).optional().default(0),
  securityDeposit: z.coerce.number().min(0).max(10_000_000).optional(),
  checkInDate: z.coerce.date().optional(),
  paymentStatus: z.enum(["PAID", "PENDING"]).optional(),
  paymentMethod: z.enum(["CASH", "ONLINE", "SPLIT"]).optional(),
  cashAmount: z.coerce.number().int().min(0).optional(),
  onlineAmount: z.coerce.number().int().min(0).optional(),
});

// Client-side form schema (plain strings, friendly for React Hook Form).
// Tenant fields are required only when the bed is marked Occupied.
export const bedFormSchema = z
  .object({
    occupancyStatus: z.enum(["AVAILABLE", "OCCUPIED"]),
    fullName: z.string().trim().max(120),
    phone: z.string().trim().max(20),
    email: z.string().trim().max(254),
    rentAmount: z.string(),
    maintenanceCharge: z.string(),
    securityDeposit: z.string(),
    checkInDate: z.string(),
    paymentStatus: z.enum(["PAID", "PENDING"]),
    paymentMethod: z.enum(["CASH", "ONLINE", "SPLIT"]).optional(),
    cashAmount: z.string().optional(),
    onlineAmount: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.email && !z.string().email().safeParse(val.email).success) {
      ctx.addIssue({ code: "custom", path: ["email"], message: "Invalid email address" });
    }
    if (val.occupancyStatus !== "OCCUPIED") return;
    if (val.fullName.trim().length < 2) {
      ctx.addIssue({ code: "custom", path: ["fullName"], message: "Tenant name is required" });
    }
    const sanitizedPhone = val.phone.replace(/[\s-]/g, "");
    if (!/^(?:\+91|91|0)?[6-9]\d{9}$/.test(sanitizedPhone)) {
      ctx.addIssue({ code: "custom", path: ["phone"], message: "Enter a valid 10-digit phone number" });
    }
    if (!val.rentAmount || Number.isNaN(Number(val.rentAmount)) || Number(val.rentAmount) < 0) {
      ctx.addIssue({ code: "custom", path: ["rentAmount"], message: "Enter the rent amount" });
    }
    if (
      val.maintenanceCharge &&
      (Number.isNaN(Number(val.maintenanceCharge)) || Number(val.maintenanceCharge) < 0)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["maintenanceCharge"],
        message: "Enter a valid amount",
      });
    }
    if (
      val.securityDeposit &&
      (Number.isNaN(Number(val.securityDeposit)) || Number(val.securityDeposit) < 0)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["securityDeposit"],
        message: "Enter a valid amount",
      });
    }
    if (!val.checkInDate) {
      ctx.addIssue({ code: "custom", path: ["checkInDate"], message: "Select a check-in date" });
    }
    if (val.paymentStatus === "PAID" && val.paymentMethod === "SPLIT") {
      const rent = Number(val.rentAmount) || 0;
      const maint = Number(val.maintenanceCharge) || 0;
      const deposit = Number(val.securityDeposit) || 0;
      // Assuming initial payment covers all three.
      const totalExpected = rent + maint + deposit;
      const cash = Number(val.cashAmount) || 0;
      const online = Number(val.onlineAmount) || 0;
      if (cash + online !== totalExpected) {
        ctx.addIssue({
          code: "custom",
          path: ["paymentMethod"],
          message: `Split amounts must equal the total of ₹${totalExpected}`,
        });
      }
    }
  });

export type BedFormValues = z.infer<typeof bedFormSchema>;
