import { z } from "zod";

export const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: z.string().min(8, "New password must be at least 8 characters").max(128),
});

export const propertySettingsSchema = z.object({
  name: z.string().trim().min(2).max(120),
  address: z.string().trim().max(240),
  city: z.string().trim().max(100),
  phone: z.string().trim().max(20),
});

