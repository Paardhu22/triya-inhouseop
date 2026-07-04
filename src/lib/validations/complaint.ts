import { z } from "zod";

export const complaintCreateSchema = z.object({
  title: z.string().trim().min(3, "Title is required").max(160),
  description: z.string().trim().max(2000),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
  assignedToId: z.string(),
});

export type ComplaintCreateValues = z.infer<typeof complaintCreateSchema>;

// Patch schema for updateComplaint: every field optional; unknown/invalid values are
// rejected before hitting Prisma. assignedToId "" means unassign (normalised in the action).
export const complaintUpdateSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  assignedToId: z.string().trim().nullish(),
});

export type ComplaintUpdateValues = z.infer<typeof complaintUpdateSchema>;
