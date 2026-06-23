import { z } from "zod";

export const complaintCreateSchema = z.object({
  title: z.string().trim().min(3, "Title is required").max(160),
  description: z.string().trim().max(2000),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
  assignedToId: z.string(),
});

export type ComplaintCreateValues = z.infer<typeof complaintCreateSchema>;
