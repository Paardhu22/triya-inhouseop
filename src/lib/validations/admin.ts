import { z } from "zod";

const id = z.string().trim().min(1);

export const roomCapacitySchema = z.object({
  roomId: id,
  targetSharing: z.coerce.number().int().min(1).max(12),
  removeBedIds: z.array(id).max(12).default([]),
});

export const floorTemplateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional().default(""),
  sharingTypes: z.array(z.coerce.number().int().min(1).max(12)).min(1).max(50),
});

export const blockSchema = z.object({
  name: z.string().trim().min(1).max(30),
});

export const floorSchema = z.object({
  templateId: id,
  blockId: z.string().trim().optional().default(""),
  number: z.coerce.number().int().min(0).max(999),
  name: z.string().trim().max(100).optional().default(""),
});

