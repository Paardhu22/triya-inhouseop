import { z } from "zod";

export const createPropertyOwnerSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(120),
  email: z.email("Enter a valid email").max(160),
  phone: z.string().trim().min(10, "Enter a valid phone number").max(20),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  // Property Owners create their own properties after logging in, so an initial
  // assignment is optional (App Owner can still hand over existing properties later).
  propertyIds: z.array(z.string().trim().min(1)).default([]),
});

export const assignPropertySchema = z.object({
  userId: z.string().trim().min(1),
  propertyId: z.string().trim().min(1),
});

export const setOwnerActiveSchema = z.object({
  userId: z.string().trim().min(1),
  active: z.boolean(),
});
